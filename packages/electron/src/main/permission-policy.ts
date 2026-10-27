// Chrome grants these to any page without a prompt; the UI copies with navigator.clipboard.writeText
// and built-in browser pages use HTML fullscreen. Everything else (media, geolocation,
// notifications, openExternal, ...) is denied on every session.
const allowedPermissions = new Set<string>(["clipboard-sanitized-write", "fullscreen"]);

export function isPermissionAllowed(permission: string): boolean {
  return allowedPermissions.has(permission);
}

type PermissionSession = {
  setPermissionCheckHandler(handler: (webContents: unknown, permission: string) => boolean): void;
  setPermissionRequestHandler(handler: (webContents: unknown, permission: string, callback: (granted: boolean) => void) => void): void;
};

export function installPermissionPolicy(session: PermissionSession): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => callback(isPermissionAllowed(permission)));
  session.setPermissionCheckHandler((_webContents, permission) => isPermissionAllowed(permission));
}
