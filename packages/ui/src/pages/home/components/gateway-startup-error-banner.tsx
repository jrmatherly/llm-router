import { Button, CircleAlert, cn, Settings } from "../shared/index";

export function GatewayStartupErrorBanner({
  className,
  message,
  onOpenServerSettings
}: {
  className?: string;
  message?: string;
  onOpenServerSettings?: () => void;
}) {
  const detail = message?.trim();
  if (!detail) {
    return null;
  }

  return (
    <div
      aria-live="assertive"
      className={cn(
        "app-no-drag flex min-w-0 items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive",
        className
      )}
      role="alert"
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Service failed to start</div>
        <div className="mt-0.5 whitespace-pre-wrap break-words">{detail}</div>
      </div>
      {onOpenServerSettings ? (
        <Button
          className="shrink-0 border-destructive/30 bg-background/80 text-destructive hover:bg-destructive/10"
          onClick={onOpenServerSettings}
          size="sm"
          type="button"
          variant="outline"
        >
          <Settings className="h-3.5 w-3.5" />
          Server
        </Button>
      ) : null}
    </div>
  );
}
