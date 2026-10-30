package handler

import (
	"io"
	"net/http"
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
		(&Handler{ProxyClient: client}).ServeHTTP(w, &http.Request{})
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
