import assert from "node:assert/strict";
import test from "node:test";
import { ensureProxyCertificateAuthority, readProxyCertificateAuthority } from "@llmr/core/proxy/certificates.ts";
import { macosManualCertificateInstallCommand } from "@llmr/core/proxy/service.ts";

test("a new proxy CA is named LLM Router CA", () => {
  ensureProxyCertificateAuthority();
  const { cert } = readProxyCertificateAuthority();
  assert.match(cert.subject.getField("CN").value, /^LLM Router CA \(/);
  assert.equal(cert.subject.getField("O").value, "LLM Router");
});

test("the macOS install command removes the current and the pre-rename CA before trusting the new one", () => {
  const lines = macosManualCertificateInstallCommand().split("\n");
  const current = lines.findIndex((line) => line.includes("delete-certificate -c 'LLM Router CA'"));
  const legacy = lines.findIndex((line) => line.includes("delete-certificate -c 'Claude Code Router CA'"));
  const trust = lines.findIndex((line) => line.includes("add-trusted-cert"));
  assert.ok(current >= 0 && legacy >= 0, "both names deleted");
  assert.ok(trust > current && trust > legacy, "deletes run before the new CA is trusted");
});
