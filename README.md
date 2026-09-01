# JipLabs Core

Domain-agnostic governance constitution and runtime for governed autonomous systems.

Package: [`@jiplabs/core`](packages/jiplabs-core) — current line: **1.0.0**.

```text
Product
  ↓
Product adapter / domain policy / evidence provider / executor
  ↓
@jiplabs/core
```

Core never depends on a product.

| Layer | Status |
|---|---|
| CORE-00 Constitution | Stable 1.0 |
| CORE-01 Governor Kernel | Stable 1.0 |
| CORE-02 Durable governance | Stable 1.0 |
| CORE-03 Evaluation corpus | Experimental |
| CORE-04 Component registry | Experimental |
| CORE-Auditor Foundation | Experimental |

## Quick start

```bash
pnpm install
pnpm test
pnpm build
```

Start here: [packages/jiplabs-core/README.md](packages/jiplabs-core/README.md)

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Integration guide](docs/INTEGRATION-GUIDE.md)
- [API stability](docs/API-STABILITY.md)
- [Compatibility / SemVer](docs/COMPATIBILITY.md)
- [Migration 0.3 → 1.0](docs/MIGRATION-0.3-TO-1.0.md)
- [Open-core strategy (ADR-001)](docs/decisions/ADR-001-JIPLABS-CORE-OPEN-CORE-STRATEGY-V1.md)
- [Capability classification](docs/CAPABILITY-CLASSIFICATION.md)
- [Constitution](docs/jiplabs-core/CORE-00-CONSTITUTION.md)
- [CORE-VAL-01 validation](docs/CORE-VAL-01-CROSS-DOMAIN-VALIDATION.md)
