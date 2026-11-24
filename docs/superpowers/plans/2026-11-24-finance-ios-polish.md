# Finance iPhone follow-up implementation plan

> Approved scope: the eight physical iPhone screenshots and the prior audit; use Superpowers systematic debugging, TDD and verification before completion.

**Goal:** fix overflowing native dates, unreadable report metrics, invoice and transfer hierarchy, settings density and locale-specific display.
**Architecture:** shared localized native date control with a bounded visible presentation; retain the actual input, ISO values, validation and browser picker. Reuse finance CSS, existing currency minor-unit conversions and existing capability gates.
**Non-goals:** backend, database, authorizations, PDF implementation, payment semantics, production records and Android redesign.
**Verification:** existing Chromium populated and empty suites, explicit iPhone-emulated WebKit job with synthetic fixtures, field/label geometry, row alignment, localized visible amounts, switch and compact tab regression assertions; review screenshots; physical iOS Safari/standalone confirmation remains a separate device check.
