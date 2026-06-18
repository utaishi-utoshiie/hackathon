package migrations

import (
	"database/sql"
	"embed"
	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var EmbedFS embed.FS

// RunMigrations runs all embedded Goose migrations on the target DB.
func RunMigrations(db *sql.DB) error {
	goose.SetBaseFS(EmbedFS)

	if err := goose.SetDialect("mysql"); err != nil {
		return err
	}

	return goose.Up(db, ".")
}
