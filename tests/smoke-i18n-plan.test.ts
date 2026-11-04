import assert from "node:assert/strict";
import test from "node:test";
import { discoveryPlan, discoveryPath } from "../ops/smoke-i18n.mjs";

test("the operational smoke covers72 stable discovery URLs, English at root and12 reciprocal languages",()=>{
  const plan=discoveryPlan("https://example.test/");
  assert.equal(plan.length,72);assert.equal(new Set(plan.map(entry=>entry.canonical)).size,72);
  assert.equal(discoveryPath("en","/"),"/");assert.equal(discoveryPath("en","/models"),"/models");
  for(const locale of ["ru","zh","ja","hi","th"]){
    const home=plan.find(entry=>entry.locale===locale&&entry.path===`/${locale}`)!;
    assert.ok(home);assert.equal(home.canonical,`https://example.test/${locale}`);
    const languages = home.languages as Record<string,string>;
    assert.equal(languages.en,"https://example.test/");assert.equal(languages["x-default"],"https://example.test/");
    assert.equal(Object.keys(home.languages).length,13);
  }
  assert.ok(plan.every(entry=>!entry.path.startsWith("/en")));
});
