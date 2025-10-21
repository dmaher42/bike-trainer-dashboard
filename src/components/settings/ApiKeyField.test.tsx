import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ApiKeyField } from "./ApiKeyField";

describe("ApiKeyField", () => {
  const baseProps: React.ComponentProps<typeof ApiKeyField> = {
    label: "Example key",
    value: "secret",
    onChange: () => undefined,
    description: "Helper",
    placeholder: "Placeholder",
  };

  it("renders the key as hidden by default and reveals it when toggled", () => {
    const hiddenMarkup = renderToStaticMarkup(<ApiKeyField {...baseProps} />);
    expect(hiddenMarkup).toContain("type=\"password\"");
    expect(hiddenMarkup).toContain("aria-pressed=\"false\"");

    const revealedMarkup = renderToStaticMarkup(
      <ApiKeyField {...baseProps} initiallyRevealed />, 
    );

    expect(revealedMarkup).toContain("type=\"text\"");
    expect(revealedMarkup).toContain("aria-pressed=\"true\"");
  });

  it("shows a saved indicator when the saved prop is true", () => {
    const markup = renderToStaticMarkup(<ApiKeyField {...baseProps} saved />);

    expect(markup).toContain(">Saved<");
  });
});
