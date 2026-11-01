package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type streamingResponseWriter struct {
	header     http.Header
	statusCode int
	firstWrite chan struct{}
	once       sync.Once
}

func newStreamingResponseWriter() *streamingResponseWriter {
	return &streamingResponseWriter{
		header:     make(http.Header),
		firstWrite: make(chan struct{}),
	}
}

func (w *streamingResponseWriter) Header() http.Header {
	return w.header
}

func (w *streamingResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
}

func (w *streamingResponseWriter) Write(body []byte) (int, error) {
	w.once.Do(func() { close(w.firstWrite) })
	return len(body), nil
}

func TestHandlerStreamsResponseBeforeEOF(t *testing.T) {
	upstreamReader, upstreamWriter := io.Pipe()
	client := &mockProxyClient{
		Response: &http.Response{
			StatusCode: http.StatusPartialContent,
			Header:     http.Header{"Content-Type": []string{"video/mp4"}},
			Body:       upstreamReader,
		},
	}
	w := newStreamingResponseWriter()
	done := make(chan struct{})

	go func() {
		defer close(done)
		(&Handler{ProxyClient: client}).ServeHTTP(w, &http.Request{Method: http.MethodGet})
	}()

	if _, err := upstreamWriter.Write([]byte("first video chunk")); err != nil {
		t.Fatalf("write first upstream chunk: %v", err)
	}

	select {
	case <-w.firstWrite:
	case <-time.After(200 * time.Millisecond):
		t.Error("handler buffered the upstream response instead of streaming the first chunk")
	}

	if err := upstreamWriter.Close(); err != nil {
		t.Fatalf("close upstream stream: %v", err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler did not return after the upstream response ended")
	}
}

type methodRecordingClient struct {
	requests []*http.Request
}

func (c *methodRecordingClient) Do(r *http.Request) (*http.Response, error) {
	c.requests = append(c.requests, r)
	return &http.Response{
		StatusCode: http.StatusPartialContent,
		Header: http.Header{
			"Content-Type":  []string{"video/mp4"},
			"Content-Range": []string{"bytes 10-19/100"},
			"Accept-Ranges": []string{"bytes"},
		},
		Body: io.NopCloser(strings.NewReader("0123456789")),
	}, nil
}

func TestHandlerRejectsEveryNonReadMethodBeforeSigning(t *testing.T) {
	for _, method := range []string{
		http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete,
		http.MethodOptions, http.MethodTrace, http.MethodConnect, "", "get", "CUSTOM",
	} {
		name := method
		if name == "" {
			name = "empty"
		}
		t.Run(name, func(t *testing.T) {
			client := &methodRecordingClient{}
			w := httptest.NewRecorder()
			r := &http.Request{Method: method, Header: make(http.Header)}
			(&Handler{ProxyClient: client}).ServeHTTP(w, r)
			if w.Code != http.StatusMethodNotAllowed {
				t.Fatalf("status = %d, want 405", w.Code)
			}
			if len(client.requests) != 0 {
				t.Fatal("rejected method reached the signing/storage client")
			}
			if got := w.Header().Get("Allow"); got != "GET, HEAD" {
				t.Errorf("Allow = %q, want GET, HEAD", got)
			}
			if got := w.Header().Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", got)
			}
		})
	}
}

func TestHandlerPreservesReadMethodsAndRangeHeaders(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			client := &methodRecordingClient{}
			w := httptest.NewRecorder()
			r := httptest.NewRequest(method, "https://media.invalid/fixture", nil)
			r.Header.Set("Range", "bytes=10-19")
			r.Header.Set("If-Range", "fixture-etag")
			(&Handler{ProxyClient: client}).ServeHTTP(w, r)
			if len(client.requests) != 1 || client.requests[0].Method != method {
				t.Fatal("allowed method was not passed unchanged to storage")
			}
			for header, want := range map[string]string{"Range": "bytes=10-19", "If-Range": "fixture-etag"} {
				if got := client.requests[0].Header.Get(header); got != want {
					t.Errorf("upstream %s = %q, want %q", header, got, want)
				}
			}
			if w.Code != http.StatusPartialContent || w.Header().Get("Content-Range") != "bytes 10-19/100" {
				t.Fatal("partial-content response was not preserved")
			}
			if w.Header().Get("Accept-Ranges") != "bytes" {
				t.Fatal("range support header was not preserved")
			}
		})
	}
}
