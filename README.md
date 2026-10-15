<p align="center"><img src="images/hero.svg" alt="Deku" width="720"></p>

# Deku: samples

<p align="center"><b>The samples lane: 3 of 30 Harbor task bundles.</b></p>

<p align="center"><a href="#summary"><img src="https://img.shields.io/badge/bundles-3_of_30-845EF7" alt="bundles: 3 of 30"></a> <a href="#evidence-status"><img src="https://img.shields.io/badge/sealed-0-845EF7" alt="sealed: 0"></a> <a href="#difficulty-tiers"><img src="https://img.shields.io/badge/difficulty-measured-845EF7" alt="difficulty: measured"></a></p>

<p align="center"><sub><a href="#abstract">Abstract</a> | <a href="#summary">Summary</a> | <a href="#difficulty-tiers">Difficulty tiers</a> | <a href="#evidence-status">Evidence status</a> | <a href="#coverage">Coverage</a> | <a href="#dataset-structure">Dataset structure</a> | <a href="#verification-and-quality-assurance">Verification and quality assurance</a> | <a href="#reproduction">Reproduction</a> | <a href="#cite">Cite</a> | <a href="#license">License</a> | <a href="#contact">Contact</a></sub></p>

## Abstract

The curated lane of this corpus: at most 30 Harbor task bundles, every anchor seated first and every other bundle in seal order. Bundles past that ceiling live in `delivery/`.

Each bundle is one Harbor task in a directory named by its content-derived uuid5, so the name doubles as an integrity check. This page is rendered from the resident bundles on every reconcile; a value a bundle does not carry reads `absent`, and the page never fills one in.

## Summary

| Property | Value |
| --- | --- |
| Bundles | 3 of 30 |
| Sealed | 0 of 3 |
| Registrations | adopted (3) |
| Audit verdicts | none (3) |
| Harbor schema | 1.4 (3) |

## Difficulty tiers

Difficulty is measured by the signed pilot alone and never declared in a bundle, so this page states no tier a bundle claims.

## Evidence status

The verdict is the audit outcome recorded at the sealed digest, and `none` means no verdict has landed for that digest yet. Only an authoring run removes a bundle from this lane, so removal waits for the next one.

| uuid | Verdict | Sealed digest | Stream |
| --- | --- | --- | --- |
| 1b21d4ac-055a-52e7-b754-0620f337b0d4 | none | absent | none |
| 63376906-d58e-5ef4-a179-0ee63775b5c0 | none | absent | none |
| e0f889a5-7a3b-5a05-a837-43ac155857a6 | none | absent | none |

## Coverage

| Keyword | Bundles |
| --- | --- |
| greenfield | 3 |
| postgres | 3 |
| mailpit | 2 |
| solo_founder | 2 |
| typescript | 2 |
| directory-matching | 1 |
| enterprise | 1 |
| inventory-allocation | 1 |
| keycloak | 1 |
| killbill | 1 |
| python | 1 |
| talent-roster-reel | 1 |

## Dataset structure

| Bundle | Task | Keywords | Registration | Sealed at | Tier |
| --- | --- | --- | --- | --- | --- |
| [`1b21d4ac-055a-52e7-b754-0620f337b0d4`](1b21d4ac-055a-52e7-b754-0620f337b0d4/) | `deku/talent-roster-reel` | directory-matching, greenfield, postgres, python, solo_founder, talent-roster-reel | adopted | unsealed | - |
| [`63376906-d58e-5ef4-a179-0ee63775b5c0`](63376906-d58e-5ef4-a179-0ee63775b5c0/) | `deku/mass-balance-attestation` | enterprise, greenfield, inventory-allocation, keycloak, mailpit, postgres, typescript | adopted | unsealed | - |
| [`e0f889a5-7a3b-5a05-a837-43ac155857a6`](e0f889a5-7a3b-5a05-a837-43ac155857a6/) | `deku/hardware-companion-storefront` | greenfield, killbill, mailpit, postgres, solo_founder, typescript | adopted | unsealed | - |

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#131a33","primaryTextColor":"#e8ecff","primaryBorderColor":"#845EF7","lineColor":"#22d3ee","fontFamily":"monospace"}}}%%
flowchart LR
    bundle["&lt;uuid&gt;/"]
    bundle --> n0["task.toml<br/>runner manifest"]
    bundle --> n1["instruction.md<br/>objective the agent reads"]
    bundle --> n2["environment/<br/>agent sandbox image"]
    bundle --> n3["tests/<br/>verifier, hidden from the agent"]
    bundle --> n4["solution/<br/>private oracle"]
    bundle --> n5["trajectories/"]
```

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#131a33","primaryTextColor":"#e8ecff","primaryBorderColor":"#845EF7","lineColor":"#22d3ee","fontFamily":"monospace"}}}%%
flowchart LR
    staging["staging/"]
    staging --> samples["samples/<br/>3 of 30"]
    samples --> delivery["delivery/<br/>0 of 10000"]
    delivery --> stock["stock/<br/>0 of 10000"]
```

## Verification and quality assurance

Each bundle's signed provenance carrier holds its screening roots, screening instant, and absolute expiry. Placement moves that carrier into the private derivation set, which this page never reads, so reconcile lists no root it cannot verify here.

## Reproduction

Each bundle directory is a complete Harbor task: `task.toml` is the runner manifest, `instruction.md` the objective, `environment/` the sandbox image, and `tests/` the verifier. Point a Harbor runner at one bundle directory to reproduce it; `solution/` stays private.

## Cite

```bibtex
@misc{deku2026,
  title        = {Deku: Measured Difficulty for Greenfield Application Environments},
  author       = {Ethara.AI},
  year         = {2026},
  note         = {Artifact in progress; no signed pilot evidence at the time of writing}
}
```

## License

Released under the MIT License, see [LICENSE](LICENSE). Task bundles, generated applications, and any data collection produced through these environments keep their own licences.

## Contact

| Purpose | Route |
| --- | --- |
| Organization | [Ethara.AI on GitHub](https://github.com/EtharaOrion) |
| Security disclosure | [security@ethara.ai](mailto:security@ethara.ai) |
| Contributions | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Reading path | [INDEX.md](INDEX.md) |
| Audit record | [VERDICT.md](VERDICT.md), absent until the first audit issues it |
