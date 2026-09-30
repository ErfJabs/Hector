.PHONY: help frontend build run dev frontend-dev release clean

# The cross-compile targets need a POSIX shell for the inline GOOS=...
# variables, and Windows make runs simple recipe lines WITHOUT one — so the
# recipes below call bash explicitly instead of relying on SHELL (which
# mingw make ignores for simple commands).
ifeq ($(OS),Windows_NT)
BASH := "C:/PROGRA~1/Git/bin/bash.exe"
else
BASH := bash
endif

# Build the React app into frontend/dist (embedded by the Go binary).
frontend:
	cd frontend && npm run build

# Build the single binary (app.exe) with the frontend embedded.
build: frontend
	go build -o app.exe .

# Build and run.
run: build
	./app.exe

# Go-only dev loop: build the frontend once, then `go run .` (restart after Go changes).
dev: frontend
	go run .

# Vite dev server on 127.0.0.1 with /api proxied to :8787 — run the Go
# server separately (go run .) for a live frontend.
frontend-dev:
	cd frontend && npm run dev

# ─── Release / CI targets ───

# Cross-compile release binaries for all supported Linux architectures.
# Output: dist/hector-linux-{amd64,arm64,armv7,armv6}
release: frontend
	@$(BASH) -c "mkdir -p dist && GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o dist/hector-linux-amd64 . && GOOS=linux GOARCH=arm64 go build -ldflags='-s -w' -o dist/hector-linux-arm64 . && GOOS=linux GOARCH=arm GOARM=7 go build -ldflags='-s -w' -o dist/hector-linux-armv7 . && GOOS=linux GOARCH=arm GOARM=6 go build -ldflags='-s -w' -o dist/hector-linux-armv6 . && ls -lh dist/"

clean:
	rm -rf app.exe frontend/dist dist

help:
	@echo "targets: frontend | build | run | dev | frontend-dev | release | clean"
