# Changelog

## [1.2.0](https://github.com/chrischall/booli-mcp/compare/v1.1.0...v1.2.0) (2026-09-02)


### Features

* **healthcheck:** adopt the shared bridge healthcheck and report the extension link state ([#52](https://github.com/chrischall/booli-mcp/issues/52)) ([e2c53cf](https://github.com/chrischall/booli-mcp/commit/e2c53cfea5d9029151876b125cd194e0c1ce1cab))


### Bug Fixes

* **healthcheck:** classify the bridge leg's challenge page and HTTP failures, and fail a zero-hit probe ([#55](https://github.com/chrischall/booli-mcp/issues/55)) ([e6c12fc](https://github.com/chrischall/booli-mcp/commit/e6c12fc10bcb91dba178712ab4b999d05ec9b710))

## [1.1.0](https://github.com/chrischall/booli-mcp/compare/v1.0.5...v1.1.0) (2026-08-29)


### Features

* **deps:** take @fetchproxy/server 2.2.0 so the concentrator can bind its sandbox address ([#40](https://github.com/chrischall/booli-mcp/issues/40)) ([fa74c82](https://github.com/chrischall/booli-mcp/commit/fa74c82ac75be610bd97be954ac17a7c6963a980))

## [1.0.5](https://github.com/chrischall/booli-mcp/compare/v1.0.4...v1.0.5) (2026-08-28)


### Bug Fixes

* **egress:** declare only the hosts the server process dials in mint.yaml ([#38](https://github.com/chrischall/booli-mcp/issues/38)) ([b4236c0](https://github.com/chrischall/booli-mcp/commit/b4236c002fc128560aac64e659ca3c7c9dcd5df3))

## [1.0.4](https://github.com/chrischall/booli-mcp/compare/v1.0.3...v1.0.4) (2026-08-28)


### Bug Fixes

* publish under the [@chrischall](https://github.com/chrischall) scope so npm accepts the package ([#36](https://github.com/chrischall/booli-mcp/issues/36)) ([5a3a149](https://github.com/chrischall/booli-mcp/commit/5a3a1497250cf42f3c54bb4b26e8de543d3fbac9))

## [1.0.3](https://github.com/chrischall/booli-mcp/compare/v1.0.2...v1.0.3) (2026-08-06)


### Bug Fixes

* **deps:** move to @fetchproxy/server 2.0.0 for the v3 handshake ([#22](https://github.com/chrischall/booli-mcp/issues/22)) ([d539fd1](https://github.com/chrischall/booli-mcp/commit/d539fd126699cfca1e27684a57b472d4e8588982))

## [1.0.2](https://github.com/chrischall/booli-mcp/compare/v1.0.1...v1.0.2) (2026-07-30)


### Bug Fixes

* **deps:** bump @fetchproxy/* to 1.7.0 and @chrischall/mcp-utils to 0.14.0 ([#13](https://github.com/chrischall/booli-mcp/issues/13)) ([753e442](https://github.com/chrischall/booli-mcp/commit/753e442b3a09fa24445a5922f00a9e757ad3e8d3))

## [1.0.1](https://github.com/chrischall/booli-mcp/compare/v1.0.0...v1.0.1) (2026-07-25)


### Bug Fixes

* **deps:** bump fast-uri out of the host-confusion advisories ([#7](https://github.com/chrischall/booli-mcp/issues/7)) ([b0212d8](https://github.com/chrischall/booli-mcp/commit/b0212d8f68d501ac1397467f32ef1fe58916ddbb))

## 1.0.0 (2026-07-13)


### Features

* add booli-fpx skill — query Booli via fpx CLI without the MCP ([#5](https://github.com/chrischall/booli-mcp/issues/5)) ([2a34f84](https://github.com/chrischall/booli-mcp/commit/2a34f84b71d1a703f21305dd174bb8446fd299ad))
* booli-mcp — Booli.se real estate MCP server ([8fddb3c](https://github.com/chrischall/booli-mcp/commit/8fddb3c1424d811379350744f571302fb657fcdd))
* read Booli via consumer GraphQL through the fetchproxy bridge ([#1](https://github.com/chrischall/booli-mcp/issues/1)) ([ef03d82](https://github.com/chrischall/booli-mcp/commit/ef03d821d8ee924478b4a5811a608026b3dc8586))


### Documentation

* drop the broken placeholder fetchproxy link in the README ([#4](https://github.com/chrischall/booli-mcp/issues/4)) ([f6b1cf6](https://github.com/chrischall/booli-mcp/commit/f6b1cf65d8e000f6899c2aeb60365a0e5c4ab610)), closes [#2](https://github.com/chrischall/booli-mcp/issues/2)
