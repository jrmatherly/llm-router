/**
 * Docs wrapper rendering the REAL, UNMODIFIED LogsView (request logs) from the
 * UI package, with empty demo data + no-op callbacks + BaseProvider.
 * Client:only on an isolated bare page. (Observability/AgentAnalysisView is a
 * SEPARATE component — ObservabilityViewDemo.)
 */
import { LogsView } from "@/pages/home/components/network-logs";
import { getRequestLogData } from "./mockData";
import { DemoShell } from "./demoRuntime";
import type { RequestLogListFilter, RequestLogPage } from "@llmr/core/contracts/app";

const noop = () => {};

export default function LogsViewDemo() {
  return (
    <DemoShell
      title="Request logs — inspect each request's details, status, and latency"
      contentClassName="docs-demo-content--data"
    >
      <div style={{ height: "100%", minHeight: 0, minWidth: 0, width: "100%" }}>
        <div className="docs-demo-app-surface docs-demo-app-surface--logs">
          <LogsView
            enabled
            error=""
            filter={{} as RequestLogListFilter}
            loading={false}
            page={getRequestLogData()}
            refreshLogs={noop}
            updateFilter={noop}
            onEnable={noop}
            onFocusedRequestHandled={noop}
          />
        </div>
      </div>
    </DemoShell>
  );
}
