import {
  appLogoUrl, formatCompactNumber, Power
} from "../shared";
import { productShortName } from "../../home/shared/brand";

export function TrayStatusStrip({ totalTokens }: { totalTokens: number }) {

  return (
    <div className="tray-status-strip mb-3 flex min-w-0 items-center justify-between gap-3 border-b pb-2.5">
      <button
        aria-label="Open LLMR"
        className="tray-header-action -ml-1 flex min-w-0 items-center gap-2 rounded-[9px] px-1 py-0.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/35"
        title="Open LLMR"
        type="button"
        onClick={() => void window.llmr?.showMainWindow()}
      >
        <TrayWindowHeaderIcon />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-slate-50">{formatCompactNumber(totalTokens)} tokens</div>
          <div className="truncate text-[10px] font-medium text-slate-400">{productShortName}</div>
        </div>
      </button>
      <button
        aria-label="Quit"
        className="tray-icon-button flex h-7 w-7 shrink-0 items-center justify-center"
        title="Quit"
        type="button"
        onClick={() => void window.llmr?.quitApp()}
      >
        <Power className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TrayWindowHeaderIcon() {
  return (
    <span
      aria-hidden="true"
      className="tray-header-icon flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border"
    >
      <img alt="" className="h-[72%] w-[72%] object-contain" src={appLogoUrl} />
    </span>
  );
}
