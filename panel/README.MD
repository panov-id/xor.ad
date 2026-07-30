# panel

<div align="center" style="margin: 30px;">
    <a href="https://refine.dev">
    <img alt="refine logo" src="https://refine.ams3.cdn.digitaloceanspaces.com/readme/refine-readme-banner.png">
    </a>
</div>
<br/>

This [Refine](https://github.com/refinedev/refine) project was generated with [create refine-app](https://github.com/refinedev/refine/tree/master/packages/create-refine-app).

## Getting Started

A React Framework for building internal tools, admin panels, dashboards & B2B apps with unmatched flexibility ✨

Refine's hooks and components simplifies the development process and eliminates the repetitive tasks by providing industry-standard solutions for crucial aspects of a project, including authentication, access control, routing, networking, state management, and i18n.

## Available Scripts

### Running the development server.

```bash
    npm run dev
```

### Building for production.

```bash
    npm run build
```

### Running the production server.

```bash
    npm run start
```

### The UI kit

`ui-kit.html` — every control the panel has, on one page, in both themes:
`http://localhost:62173/ui-kit.html` with the dev server running.

It is the place to look before writing a new page, and the place to add a
component when a new one earns its keep. Two rules keep it honest:

- it imports `src/App.css` rather than carrying a copy, so it is painted by the
  same file the product is;
- the markup printed under each example is read out of the rendered DOM, not
  typed alongside it — a snippet a person maintains drifts, and then the kit
  teaches the wrong thing.

Dev only: Vite builds `index.html`, so the kit is never part of a bundle.

### Contrast

```bash
    node check-contrast.mjs
```

Reads the tokens out of `src/App.css` and checks every ink against the surface
it is printed on, in both themes, against 4.5:1. Runs in CI (`.github/workflows/panel.yml`).

## Learn More

To learn more about **Refine**, please check out the [Documentation](https://refine.dev/docs)

- **React Router** [Docs](https://refine.dev/docs/core/providers/router-provider/)
- **Data Provider** [Docs](https://refine.dev/docs/core/providers/data-provider/#overview) — ours talks to the relay control plane, see `src/providers/data.ts`

## License

MIT
