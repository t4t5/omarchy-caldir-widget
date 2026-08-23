import assert from "node:assert/strict"
import test from "node:test"

import {
  errorMessage,
  isBeforeMinimumVersion
} from "../model/check-caldir-version.mjs"

test("caldir versions before 0.12.1 require an update", () => {
  assert.equal(isBeforeMinimumVersion("caldir-cli 0.11.1\n"), true)
  assert.equal(isBeforeMinimumVersion("caldir-cli 0.12.0"), true)
  assert.equal(isBeforeMinimumVersion("caldir-cli v0.12.1-beta.1"), true)
  assert.equal(isBeforeMinimumVersion("caldir-cli 0.12.1"), false)
  assert.equal(isBeforeMinimumVersion("caldir-cli 0.13.2"), false)
  assert.equal(isBeforeMinimumVersion("unexpected output"), false)
})

test("the version check accepts only identifiable supported versions", () => {
  assert.match(errorMessage(0, "caldir-cli 0.12.0"), /v0\.12\.1 or newer/)
  assert.equal(errorMessage(0, "caldir-cli 0.12.1"), "")
  assert.match(errorMessage(0, "unexpected output"), /determine the installed caldir version/)
  assert.match(errorMessage(1, ""), /check the installed caldir version/)
})
