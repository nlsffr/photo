FROM golang:1.23.6-alpine AS build

RUN apk --no-cache add ca-certificates git

WORKDIR /src
RUN git clone https://github.com/awslabs/aws-sigv4-proxy.git . \
    && git checkout fb42fe8db8d4ebed5f6761402d8a2617963d4c72

COPY handler.go /src/handler/handler.go
COPY streaming_test.go /src/handler/streaming_test.go

RUN go test ./handler -count=1 \
    && CGO_ENABLED=0 GOOS=linux go build -o /aws-sigv4-proxy ./cmd/aws-sigv4-proxy

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /aws-sigv4-proxy /aws-sigv4-proxy

ENTRYPOINT ["/aws-sigv4-proxy"]
