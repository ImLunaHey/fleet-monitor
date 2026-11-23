import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardAccess } from "./DashboardAccess";

describe("DashboardAccess", () => {
  it.each([
    undefined,
    null,
    "",
    "not a URL",
    "javascript:alert(1)",
    "ftp://example.com",
    "https://user:secret@example.com",
    "https://user@example.com",
  ])("hides absent or unsafe URL %s", (url) => {
    const { container } = render(<DashboardAccess url={url} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("uses the configured address rather than the kiosk's localhost URL", () => {
    render(<DashboardAccess url="http://192.0.2.10:8099/" />);
    expect(screen.getByText("Scan to open this dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "192.0.2.10:8099" })).toHaveAttribute(
      "href",
      "http://192.0.2.10:8099/",
    );
    expect(screen.getByTitle("Connect to the same network")).toBeInTheDocument();
  });
});
