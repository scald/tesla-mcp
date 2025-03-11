# Tesla MCP Server GitHub Pages

This directory contains the GitHub Pages website for the Tesla MCP Server project.

## Enabling GitHub Pages

To enable GitHub Pages for this repository:

1. Go to your repository on GitHub
2. Click on "Settings"
3. Scroll down to the "GitHub Pages" section
4. Under "Source", select "Deploy from a branch"
5. Select the branch (usually `main` or `master`) and the `/docs` folder
6. Click "Save"

Your site will be published at `https://[username].github.io/tesla-mcp/`

## Local Development

To preview the site locally:

```bash
# Navigate to the docs directory
cd docs

# If you have Python installed
python -m http.server 8000

# Or if you have Node.js installed
npx serve
```

Then open your browser to `http://localhost:8000` or `http://localhost:3000` (for serve).

## Customization

Feel free to customize the site by editing:

- `index.html` - Main content and structure
- `css/styles.css` - Styling and appearance
- `images/` - Add any images you want to use

## License

This website is covered by the same license as the main project.
