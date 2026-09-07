# Contributing to rezilia

Thank you for your interest in contributing! 🎉

## Getting Started

```bash
git clone https://github.com/abhishek-majumdar/rezilia.git
cd rezilia
npm install
npm run build
npm test
```

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes in `src/`
4. Write tests in `tests/`
5. Run `npm test` and `npm run typecheck`
6. Commit using Conventional Commits: `feat: add X`, `fix: resolve Y`
7. Open a Pull Request

## Code Style

- TypeScript strict mode — no `any`, no implicit returns
- Every public function must have a JSDoc comment
- Every new feature must have tests
- Run `npm run lint:fix` and `npm run format` before committing

## Commit Convention

```
feat: add Redis store support
fix: resolve memory leak in MemoryStore sweep
docs: update SmartCache examples
test: add circuit breaker half-open tests
chore: upgrade vitest to v2
```

## Reporting Issues

Please use GitHub Issues and include:
- Node.js / Bun version
- Package version
- Minimal reproduction
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
