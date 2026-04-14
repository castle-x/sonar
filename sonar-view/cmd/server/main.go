package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sonar-view/config"
	"sonar-view/internal/db"
	"sonar-view/internal/handler"
	"sonar-view/internal/repo"
	"sonar-view/internal/service"
	"sonar-view/internal/ws"
)

func main() {
	// Load config
	cfgPath := os.Getenv("CONFIG_PATH")
	if cfgPath == "" {
		cfgPath = "config/config.yaml"
	}
	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Printf("[WARN] using default config: %v", err)
		cfg = config.DefaultConfig()
	}

	// Override addr from env
	if port := os.Getenv("PORT"); port != "" {
		cfg.Addr = ":" + port
	}
	if addr := os.Getenv("ADDR"); addr != "" {
		cfg.Addr = addr
	}

	// Open SQLite database
	sqlitePath := cfg.SQLite.Path
	if sqlitePath == "" {
		sqlitePath = "./data/sonar-view.db"
	}
	sqlDB, err := db.Open(sqlitePath)
	if err != nil {
		log.Fatalf("[FATAL] open sqlite: %v", err)
	}
	defer sqlDB.Close()
	log.Printf("[INFO] sqlite opened: %s", sqlitePath)

	// Create repos
	snapshotRepo := repo.NewSnapshotRepo(sqlDB)
	chunkRepo := repo.NewChunkRepo(sqlDB)
	storeConfigRepo := repo.NewStoreConfigRepo(sqlDB)

	// Create WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()

	// Create aggregation service
	aggService, err := service.NewAggregationService(cfg, hub)
	if err != nil {
		log.Fatalf("[FATAL] create aggregation service failed: %v", err)
	}
	if err := aggService.Start(); err != nil {
		log.Fatalf("[FATAL] start aggregation service failed: %v", err)
	}
	defer aggService.Stop()

	// Create store client
	storeClient := service.NewStoreClient(storeConfigRepo, cfg.Store.Addr)

	// Create services
	snapshotService := service.NewSnapshotService(snapshotRepo, chunkRepo)
	storeConfigService := service.NewStoreConfigService(storeConfigRepo)

	// Bootstrap: if no store configs exist and config.yaml has a store addr, create default
	if cfg.Store.Addr != "" {
		if existing, err := storeConfigRepo.List(context.Background()); err == nil && len(existing) == 0 {
			created, err := storeConfigService.Create(context.Background(), "default", cfg.Store.Addr, "Auto-created from config")
			if err == nil {
				_ = storeConfigRepo.SetActive(context.Background(), created.ID)
				log.Printf("[INFO] bootstrapped default store config: %s", cfg.Store.Addr)
			}
		}
	}

	// Create handlers
	healthHandler := handler.NewHealthHandler()
	statusHandler := handler.NewStatusHandler()
	metricsHandler := handler.NewMetricsHandler(storeClient)
	snapshotHandler := handler.NewSnapshotHandler(snapshotService)
	tapHandler := handler.NewTapHandler(storeClient)
	scoringHandler := handler.NewScoringHandler()
	storeConfigHandler := handler.NewStoreConfigHandler(storeConfigService)

	// WebSocket handler
	wsHandler := func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r)
	}

	// Setup routes
	mux := http.NewServeMux()

	// Health & Status
	mux.HandleFunc("GET /health", healthHandler.Health)
	mux.HandleFunc("GET /api/v1/status", statusHandler.Status)

	// Metrics (proxy to sonar-store)
	mux.HandleFunc("POST /api/v1/metrics/query", metricsHandler.QueryMetrics)

	// Snapshots
	mux.HandleFunc("GET /api/v1/snapshots", snapshotHandler.ListSnapshots)
	mux.HandleFunc("POST /api/v1/snapshots", snapshotHandler.CreateSnapshot)
	mux.HandleFunc("GET /api/v1/snapshots/{id}", snapshotHandler.GetSnapshot)
	mux.HandleFunc("DELETE /api/v1/snapshots/{id}", snapshotHandler.DeleteSnapshot)
	mux.HandleFunc("GET /api/v1/snapshots/{id}/metrics", snapshotHandler.GetSnapshotMetrics)

	// Store configs
	mux.HandleFunc("GET /api/v1/store-configs", storeConfigHandler.List)
	mux.HandleFunc("POST /api/v1/store-configs", storeConfigHandler.Create)
	mux.HandleFunc("PUT /api/v1/store-configs/{id}", storeConfigHandler.Update)
	mux.HandleFunc("DELETE /api/v1/store-configs/{id}", storeConfigHandler.Delete)
	mux.HandleFunc("POST /api/v1/store-configs/{id}/activate", storeConfigHandler.Activate)

	// Taps
	mux.HandleFunc("GET /api/v1/taps", tapHandler.ListTaps)
	mux.HandleFunc("/api/v1/proxy/taps/{tap_id}/{path...}", tapHandler.ProxyTap)

	// Scoring templates
	mux.HandleFunc("GET /api/v1/scoring/templates", scoringHandler.ListTemplates)

	// WebSocket
	mux.HandleFunc("/ws", wsHandler)

	// CORS middleware
	handlerWithCORS := corsMiddleware(mux)

	srv := &http.Server{
		Addr:         cfg.Addr,
		Handler:      handlerWithCORS,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("[INFO] sonar-view starting on %s", cfg.Addr)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] server error: %v", err)
		}
	}()

	<-quit
	log.Printf("[INFO] shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[ERROR] server shutdown error: %v", err)
	}
	log.Printf("[INFO] server stopped")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
