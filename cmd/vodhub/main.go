package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vodhub/internal/auth"
	"vodhub/internal/cms"
	"vodhub/internal/config"
	"vodhub/internal/douban"
	"vodhub/internal/proxy"
	"vodhub/internal/server"
	"vodhub/internal/store"
	"vodhub/web"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := config.Load()

	srcStore, err := store.Open(cfg.DataDir)
	if err != nil {
		logger.Error("failed to open source store", "error", err, "data_dir", cfg.DataDir)
		os.Exit(1)
	}

	cmsClient := cms.NewClient(cfg.SearchConcurrency, cfg.SearchTimeout, cfg.UpstreamProxy)

	// Optional one-time bootstrap from SOURCES_URL / SOURCES_JSON when empty.
	seedCtx, seedCancel := context.WithTimeout(context.Background(), 20*time.Second)
	if err := srcStore.BootstrapIfEmpty(seedCtx, cmsClient.DirectHTTPClient(), cfg.SourcesURL, cfg.SourcesJSON); err != nil {
		logger.Warn("initial source bootstrap failed", "error", err)
	}
	seedCancel()

	authSvc := auth.NewService(cfg.AdminPassword, cfg.AccessPassword, cfg.AuthSecret, cfg.AuthTokenTTL)
	doubanSvc := douban.NewService(cmsClient.DirectHTTPClient())
	imgProxy := proxy.NewImageProxy(cfg.ImageProxyAllowedHosts)

	srv := server.New(cfg, logger, authSvc, srcStore, cmsClient, doubanSvc, imgProxy, web.DistFS())

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("vodhub server started",
			"addr", httpServer.Addr,
			"data_dir", cfg.DataDir,
			"sources", len(srcStore.List()),
			"upstream_proxy_enabled", cmsClient.HasUpstreamProxy(),
		)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		logger.Error("server error", "error", err)
		os.Exit(1)
	case sig := <-sigCh:
		logger.Info("shutting down", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(ctx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
		}
	}
}
