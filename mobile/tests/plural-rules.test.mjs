import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES, plural } from "../../src/features/i18n/locales.ts";

test("native startup supplies plural rules for every supported language", async () => {
  const NativePluralRules = Intl.PluralRules;
  const counts = [0, 1, 2, 3, 5, 11, 21, 22, 25, 101, 1.5];
  const forms = { zero: "zero", one: "one", two: "two", few: "few", many: "many", other: "other" };
  delete Intl.PluralRules;
  try {
    await import("../src/polyfills.ts");
    for (const locale of LOCALES) {
      const expected = new NativePluralRules(locale);
      for (const count of counts) {
        assert.equal(plural(locale, count, forms), expected.select(count), `${locale}: ${count}`);
      }
    }
  } finally {
    Intl.PluralRules = NativePluralRules;
  }
});
