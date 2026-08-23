import assert from "node:assert/strict"
import test from "node:test"

import {
  errorMessage,
  isBeforeJsonSupport
} from "../model/check-caldir-version.mjs"

test("caldir versions before JSON support require an update", () => {
  assert.equal(isBeforeJsonSupport("caldir-cli 0.11.1\n"), true)
  assert.equal(isBeforeJsonSupport("caldir-cli v0.12.0-beta.1"), true)
  assert.equal(isBeforeJsonSupport("caldir-cli 0.12.0"), false)
  assert.equal(isBeforeJsonSupport("caldir-cli 0.13.2"), false)
  assert.equal(isBeforeJsonSupport("unexpected output"), false)
})

test("the version check owns old-version and fallback error messages", () => {
  assert.match(errorMessage(0, "caldir-cli 0.11.1", "unknown option --json"), /v0\.12\.0 or newer/)
  assert.equal(errorMessage(0, "caldir-cli 0.13.2", "unknown failure"), "caldir failed: unknown failure")
  assert.equal(
    errorMessage(1, "", ""),
    "Could not run caldir. Install it, then run caldir add and caldir pull."
  )
})
