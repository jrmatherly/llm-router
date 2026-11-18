# LLMR Login Import Chrome Extension

This unpacked Chrome extension imports cookies and localStorage for explicitly selected domains into LLMR's in-app browser.

## Development install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension/chrome` directory.

After changing extension files, click **Reload** for this unpacked extension in `chrome://extensions`.
The extension holds site access only for LLMR's local import server. The first import for a domain opens the extension popup, where **Import** makes Chrome ask for access to that domain.

## Flow

1. An agent calls LLMR's Chrome login import browser tool, or the user clicks the key button in LLMR's in-app browser.
2. LLMR opens a one-time confirmation page in the system browser.
3. If the confirmation page opens in Chrome with this extension installed, review the requested domains and click **Confirm and Import**.
4. If the confirmation page opens in another browser, copy the **Extension import URL** from LLMR, open the LLMR Login Import extension popup in Chrome, paste that URL, click **Load Job**, and click **Import**.

The extension reads only the domains listed in the LLMR job. It does not enumerate all Chrome cookies.

For localStorage, the extension temporarily opens non-active tabs for the selected origins, reads `localStorage`, then closes those tabs.
