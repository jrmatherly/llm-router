import assert from "node:assert/strict";
import test from "node:test";
import { extractAnthropicWebSearchQueryHint } from "@ccr/core/gateway/features/hosted-web-search/discovery.ts";
import { synthesizeWebSearchAnswer } from "@ccr/core/gateway/features/hosted-web-search/evidence.ts";

function queryHint(text) {
  return extractAnthropicWebSearchQueryHint({ messages: [{ content: text, role: "user" }] });
}

test("a search intent prefix is stripped only as whole words", () => {
  assert.equal(queryHint("search for formula one results"), "formula one results");
  assert.equal(queryHint("search formula one results"), "search formula one results");
  assert.equal(queryHint("look up the opening hours"), "the opening hours");
  assert.equal(queryHint("look upcoming concerts"), "look upcoming concerts");
});

function weatherRecord(content) {
  return {
    completedAtMs: 0,
    engine: "bing",
    query: "weather in St. Louis",
    results: [{ content, title: "St. Louis weather", url: "https://weather.example.com/st-louis" }],
    searchUrl: "https://www.bing.com/search?q=weather",
    toolName: "web_search"
  };
}

test("a weather answer keeps a dotted location and reads highs and lows", () => {
  const answer = synthesizeWebSearchAnswer([weatherRecord("Today in St. Louis 21°C with highs of 24°C and lows of 15°C. Humidity: 60%.")], "weather in St. Louis");
  assert.match(answer ?? "", /^St\. Louis weather: currently about 21°C/);
  assert.match(answer ?? "", /the high is 24°C and the low is 15°C/);
});
