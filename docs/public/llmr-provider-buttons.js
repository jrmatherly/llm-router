(function () {
  "use strict";

  var VERSION = "0.2.0";
  var STYLE_ID = "llmr-provider-buttons-style";
  var OFFICIAL_LLMR_ICON_URL = "https://jrmatherly.github.io/llm-router/llmr-icon.png";

  var LINK_PARAMS = [
    "name",
    "base_url",
    "api_key",
    "protocol",
    "icon",
    "source",
    "payload",
    "usage_url",
    "usage_method",
    "usage_headers",
    "usage_body",
    "balance",
    "balance_unit",
    "subscription",
    "subscription_limit",
    "subscription_reset",
    "subscription_unit",
    "subscription_window"
  ];
  var ELEMENT_ATTRIBUTES = LINK_PARAMS.concat(["manifest", "models", "fetch_usage", "description", "color", "color_2", "color_3"]);

  var CSS = [
    ".llmr-provider-button{--llmrpb-brand:#17201c;--llmrpb-brand-2:#36624d;--llmrpb-brand-3:#dff8eb;position:relative;isolation:isolate;display:grid;grid-template-columns:132px minmax(0,1fr);align-items:center;min-height:86px;width:100%;max-width:420px;padding:13px 16px 13px 12px;overflow:hidden;border:1px solid color-mix(in srgb,var(--llmrpb-brand-2) 42%,transparent);border-radius:12px;background:radial-gradient(circle at 14% 22%,color-mix(in srgb,var(--llmrpb-brand-3) 34%,transparent) 0,transparent 30%),radial-gradient(circle at 96% 96%,color-mix(in srgb,var(--llmrpb-brand-2) 44%,transparent) 0,transparent 46%),linear-gradient(135deg,var(--llmrpb-brand),color-mix(in srgb,var(--llmrpb-brand-2) 88%,#111 12%));box-shadow:0 10px 26px color-mix(in srgb,var(--llmrpb-brand) 22%,transparent),inset 0 1px 0 rgba(255,255,255,.16);box-sizing:border-box;color:#fff;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;text-decoration:none;transform:translateY(0);transition:border-color 180ms ease,box-shadow 220ms ease,transform 220ms ease;}",
    ".llmr-provider-button::before{content:\"\";position:absolute;inset:-40% auto -40% -70%;z-index:-1;width:58%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.26),transparent);transform:skewX(-18deg);transition:transform 620ms ease;}",
    ".llmr-provider-button::after{content:\"\";position:absolute;right:-38px;bottom:-52px;z-index:-2;width:132px;height:132px;border-radius:999px;background:radial-gradient(circle,color-mix(in srgb,var(--llmrpb-brand-3) 38%,transparent),transparent 68%);opacity:.82;transform:scale(.96);transition:opacity 220ms ease,transform 220ms ease;}",
    ".llmr-provider-button:hover,.llmr-provider-button:focus-visible{border-color:color-mix(in srgb,var(--llmrpb-brand-3) 68%,rgba(255,255,255,.34));box-shadow:0 16px 34px color-mix(in srgb,var(--llmrpb-brand) 30%,transparent),0 0 0 1px color-mix(in srgb,var(--llmrpb-brand-3) 26%,transparent),inset 0 1px 0 rgba(255,255,255,.22);color:#fff;text-decoration:none;transform:translateY(-3px);}",
    ".llmr-provider-button:hover::before,.llmr-provider-button:focus-visible::before{transform:translateX(320%) skewX(-18deg);}",
    ".llmr-provider-button:hover::after,.llmr-provider-button:focus-visible::after{opacity:1;transform:scale(1.08);}",
    ".llmr-provider-button:active{transform:translateY(-1px) scale(.992);}",
    ".llmrpb-provider-icon{position:relative;z-index:1;grid-column:1;grid-row:1;justify-self:start;display:grid;place-items:center;width:48px;height:48px;overflow:hidden;border:1px solid rgba(255,255,255,.46);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--llmrpb-brand-3) 34%,rgba(255,255,255,.9)),color-mix(in srgb,var(--llmrpb-brand-2) 64%,#111 36%));box-shadow:0 8px 18px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.42);color:#fff;font-size:15px;font-weight:820;letter-spacing:0;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.34);transform:rotate(0) scale(1);transition:border-color 180ms ease,box-shadow 220ms ease,transform 220ms ease;}",
    ".llmrpb-provider-icon img{box-sizing:border-box;display:block;width:100%;height:100%;background:color-mix(in srgb,#fff 84%,var(--llmrpb-brand-3));object-fit:contain;filter:drop-shadow(0 1px 1px rgba(0,0,0,.12));}",
    ".llmrpb-provider-mark{display:block;max-width:42px;overflow:hidden;text-align:center;text-overflow:ellipsis;white-space:nowrap;}",
    ".llmrpb-flow{display:inline-flex;grid-column:1;grid-row:1;align-items:center;justify-self:end;justify-content:flex-end;gap:8px;width:72px;height:48px;padding:0;border:0;background:transparent;color:rgba(255,255,255,.86);font-size:14px;font-weight:760;line-height:1;box-shadow:none;transform:translateX(0);transition:transform 220ms ease;}",
    ".llmrpb-llmr-icon{box-sizing:border-box;display:grid;flex:0 0 auto;place-items:center;width:48px;height:48px;overflow:hidden;border:0;border-radius:12px;background:transparent;box-shadow:none;transition:transform 220ms ease;}",
    ".llmrpb-llmr-icon img{box-sizing:border-box;display:block;width:48px;height:48px;border-radius:12px;}",
    ".llmrpb-arrow{display:inline-block;order:-1;line-height:1;transform:translateX(0);transition:transform 220ms ease;}",
    ".llmrpb-copy{display:grid;min-width:0;gap:2px;padding:0 0 0 6px;}",
    ".llmrpb-name{display:block;overflow:hidden;color:#fff;font-size:15px;font-weight:780;line-height:1.25;text-overflow:ellipsis;white-space:nowrap;}",
    ".llmrpb-description{display:block;overflow:hidden;color:rgba(255,255,255,.74);font-size:11px;font-weight:650;letter-spacing:0;line-height:1.35;text-overflow:ellipsis;white-space:nowrap;}",
    ".llmr-provider-button:hover .llmrpb-provider-icon,.llmr-provider-button:focus-visible .llmrpb-provider-icon{border-color:color-mix(in srgb,var(--llmrpb-brand-3) 74%,rgba(255,255,255,.54));box-shadow:0 12px 24px rgba(0,0,0,.18),0 0 0 4px color-mix(in srgb,var(--llmrpb-brand-3) 16%,transparent),inset 0 1px 0 rgba(255,255,255,.52);transform:rotate(-3deg) scale(1.06);}",
    ".llmr-provider-button:hover .llmrpb-flow,.llmr-provider-button:focus-visible .llmrpb-flow{transform:translateX(3px);}",
    ".llmr-provider-button:hover .llmrpb-llmr-icon,.llmr-provider-button:focus-visible .llmrpb-llmr-icon{transform:scale(1.04);}",
    ".llmr-provider-button:hover .llmrpb-arrow,.llmr-provider-button:focus-visible .llmrpb-arrow{transform:translateX(2px);}",
    "@media (max-width:520px){.llmr-provider-button{grid-template-columns:118px minmax(0,1fr);min-height:92px;padding:12px}.llmrpb-provider-icon,.llmrpb-provider-icon img,.llmrpb-flow,.llmrpb-llmr-icon,.llmrpb-llmr-icon img{width:44px;height:44px}.llmrpb-provider-icon img,.llmrpb-llmr-icon,.llmrpb-llmr-icon img{border-radius:11px}.llmrpb-flow{width:66px;justify-self:end}}",
    "@media (prefers-reduced-motion:reduce){.llmr-provider-button,.llmr-provider-button::before,.llmr-provider-button::after,.llmrpb-provider-icon,.llmrpb-flow,.llmrpb-llmr-icon,.llmrpb-arrow{transition:none}.llmr-provider-button:hover,.llmr-provider-button:focus-visible,.llmr-provider-button:hover .llmrpb-provider-icon,.llmr-provider-button:focus-visible .llmrpb-provider-icon,.llmr-provider-button:hover .llmrpb-flow,.llmr-provider-button:focus-visible .llmrpb-flow,.llmr-provider-button:hover .llmrpb-llmr-icon,.llmr-provider-button:focus-visible .llmrpb-llmr-icon,.llmr-provider-button:hover .llmrpb-arrow,.llmr-provider-button:focus-visible .llmrpb-arrow{transform:none}.llmr-provider-button::before{display:none}}"
  ].join("");

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function isPresent(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
  }

  function stringifyValue(value) {
    if (value === true) {
      return "1";
    }
    if (value === false) {
      return "0";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function appendParam(params, key, value) {
    if (!isPresent(value)) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (isPresent(item)) {
          params.append(key, stringifyValue(item));
        }
      });
      return;
    }
    params.append(key, stringifyValue(value));
  }

  function providerUrl(options) {
    options = options || {};
    var params = new URLSearchParams();
    if (isPresent(options.manifest)) {
      params.set("manifest", stringifyValue(options.manifest));
      return "llmr://provider?" + params.toString();
    }
    LINK_PARAMS.forEach(function (key) {
      appendParam(params, key, options[key]);
    });
    appendParam(params, "models", options.models);
    appendParam(params, "fetch_usage", options.fetch_usage);
    return "llmr://provider?" + params.toString();
  }

  function createImage(src, alt) {
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  function providerInitials(name) {
    var words = String(name || "")
      .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) {
      return "AI";
    }
    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
  }

  function protocolDescription(options) {
    if (options.description) {
      return options.description;
    }
    if (options.manifest) {
      return "Remote provider manifest";
    }
    if (options.protocol) {
      return options.protocol.replace(/_/g, " ");
    }
    return "Import provider to LLMR";
  }

  function providerName(options) {
    return options.name || (options.manifest ? "Provider manifest" : "Provider");
  }

  function providerId(options) {
    return providerName(options).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
  }

  function applyColors(element, options) {
    element.style.setProperty("--llmrpb-brand", options.color || "#17201c");
    element.style.setProperty("--llmrpb-brand-2", options.color_2 || "#36624d");
    element.style.setProperty("--llmrpb-brand-3", options.color_3 || "#dff8eb");
  }

  function createProviderIcon(options) {
    var shell = document.createElement("span");
    shell.className = "llmrpb-provider-icon";
    if (options.icon) {
      shell.appendChild(createImage(options.icon, providerName(options)));
      return shell;
    }
    var mark = document.createElement("span");
    mark.className = "llmrpb-provider-mark";
    mark.textContent = providerInitials(providerName(options));
    shell.appendChild(mark);
    return shell;
  }

  function createButton(options) {
    options = options || {};
    var button = document.createElement("a");
    button.className = "llmr-provider-button llmr-provider-" + providerId(options);
    button.href = providerUrl(options);
    button.dataset.llmrProviderName = providerName(options);
    button.setAttribute("aria-label", "Import " + providerName(options) + " provider to LLMR");
    applyColors(button, options);

    var providerIcon = createProviderIcon(options);

    var flow = document.createElement("span");
    flow.className = "llmrpb-flow";

    var llmrIconShell = document.createElement("span");
    llmrIconShell.className = "llmrpb-llmr-icon";
    llmrIconShell.appendChild(createImage(OFFICIAL_LLMR_ICON_URL, "LLMR"));

    var arrow = document.createElement("span");
    arrow.className = "llmrpb-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    flow.appendChild(llmrIconShell);
    flow.appendChild(arrow);

    var copy = document.createElement("span");
    copy.className = "llmrpb-copy";

    var name = document.createElement("span");
    name.className = "llmrpb-name";
    name.textContent = providerName(options);

    var description = document.createElement("span");
    description.className = "llmrpb-description";
    description.textContent = protocolDescription(options);

    copy.appendChild(name);
    copy.appendChild(description);

    button.appendChild(providerIcon);
    button.appendChild(flow);
    button.appendChild(copy);
    return button;
  }

  function render(target, options) {
    options = options || {};
    var root = typeof target === "string" ? document.querySelector(target) : target;
    if (!root) {
      throw new Error("LLMRProviderButtons.render target not found");
    }
    injectStyles();
    var button = createButton(options);
    if (options.clear !== false) {
      root.textContent = "";
    }
    root.appendChild(button);
    return {
      element: button,
      href: button.href,
      destroy: function () {
        if (button.parentNode) {
          button.parentNode.removeChild(button);
        }
      }
    };
  }

  function attributeOptions(element) {
    var options = {};
    ELEMENT_ATTRIBUTES.forEach(function (name) {
      if (!element.hasAttribute(name)) {
        return;
      }
      var value = element.getAttribute(name);
      options[name] = name === "fetch_usage" && value === "" ? true : value;
    });
    return options;
  }

  function defineElement(name) {
    if (!("customElements" in window) || customElements.get(name)) {
      return;
    }
    customElements.define(name, class extends HTMLElement {
      static get observedAttributes() {
        return ELEMENT_ATTRIBUTES;
      }
      connectedCallback() {
        this.render();
      }
      attributeChangedCallback() {
        if (this.isConnected) {
          this.render();
        }
      }
      render() {
        render(this, attributeOptions(this));
      }
    });
  }

  function defineElements() {
    defineElement("llmr-provider-button");
    defineElement("llmr-provider-buttons");
  }

  window.LLMRProviderButtons = {
    version: VERSION,
    render: render,
    renderButton: render,
    createButton: function (options) {
      injectStyles();
      return createButton(options || {});
    },
    createProviderUrl: providerUrl
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", defineElements, { once: true });
  } else {
    defineElements();
  }
}());
