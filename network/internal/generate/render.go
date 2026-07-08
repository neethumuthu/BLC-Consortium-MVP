package generate

import (
	"fmt"
	"os"
	"path/filepath"
	"text/template"
)

// Render renders the template at templatePath using data (any of this
// package's *Data types — TemplateData, ComposeData, ...), writing the
// result to outputPath. It creates outputPath's parent directory if it
// doesn't already exist, since network/generated/ is gitignored and won't
// exist on a fresh checkout. Shared by every generate target (configtx,
// compose, ...) rather than duplicated per target — the logic is
// identical regardless of which template/data pair is being rendered.
func Render(data any, templatePath, outputPath string) error {
	tmpl, err := template.ParseFiles(templatePath)
	if err != nil {
		return fmt.Errorf("parsing template %s: %w", templatePath, err)
	}

	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return fmt.Errorf("creating output directory for %s: %w", outputPath, err)
	}

	out, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("creating output file %s: %w", outputPath, err)
	}
	defer out.Close()

	if err := tmpl.Execute(out, data); err != nil {
		return fmt.Errorf("rendering template %s: %w", templatePath, err)
	}

	return nil
}
