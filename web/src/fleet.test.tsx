import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import App, { Dashboard } from "./App";
import { appendHistory, fetchJSON, useFleet } from "./fleet";
import { metrics, now } from "./test-fixtures";
const wrapperFor = (client: QueryClient) =>
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("telemetry requests", () => {
  it("checks response status, disables caching, and supports cancellation", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchJSON("/api/fleet", controller.signal)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "/api/fleet",
      expect.objectContaining({ cache: "no-store" }),
    );
    const options = fetch.mock.calls[0][1] as RequestInit;
    controller.abort();
    expect(options.signal?.aborted).toBe(true);
    fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(fetchJSON("/api/fleet", new AbortController().signal)).rejects.toThrow("503");
  });
  it("aborts stalled requests at the timeout", async () => {
    vi.useFakeTimers();
    // Use the controllable timer for AbortSignal.timeout; jsdom otherwise uses a native timer.
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ),
    );
    const pending = fetchJSON("/api/fleet", new AbortController().signal).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(3500);
    expect(await pending).toEqual(new Error("aborted"));
  });
  it("keeps history across successful polls and failures, then recovers", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    let timestamp = now;
    let failed = false;
    let disconnected = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url === "/api/config"
                ? { title: "Lab" }
                : disconnected
                  ? { host: { online: false } }
                  : { host: { online: true, metrics: { ...metrics(), timestamp } } },
            ),
            { status: failed && url === "/api/fleet" ? 503 : 200 },
          ),
      ),
    );
    const { result, unmount } = renderHook(useFleet, { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.histories.host).toHaveLength(1));
    expect(result.current.config.title).toBe("Lab");
    timestamp += 2;
    await act(async () => {
      await client.refetchQueries({ queryKey: ["fleet"] });
    });
    await waitFor(() => expect(result.current.histories.host).toHaveLength(2));
    disconnected = true;
    await act(async () => {
      await client.refetchQueries({ queryKey: ["fleet"] });
    });
    await waitFor(() => expect(result.current.fleet.host.online).toBe(false));
    expect(result.current.fleet.host.metrics?.timestamp).toBe(timestamp);
    expect(result.current.histories.host).toHaveLength(2);
    disconnected = false;
    failed = true;
    await act(async () => {
      await client.refetchQueries({ queryKey: ["fleet"] });
    });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.histories.host).toHaveLength(2);
    failed = false;
    timestamp += 2;
    await act(async () => {
      await client.refetchQueries({ queryKey: ["fleet"] });
    });
    await waitFor(() => expect(result.current.histories.host).toHaveLength(3));
    expect(result.current.error).toBe(false);
    unmount();
    client.clear();
  });
  it("skips offline and incomplete peers without mutating history", () => {
    const previous = { host: [{ t: now, cpu: 1 }] };
    const next = appendHistory(previous, {
      host: { online: false },
      incomplete: { online: true },
      fresh: { online: true, metrics: metrics() },
    });
    expect(previous).toEqual({ host: [{ t: now, cpu: 1 }] });
    expect(next.host).toEqual(previous.host);
    expect(next.incomplete).toBeUndefined();
    expect(next.fresh[0].gpu).toBe(0);
  });
});
describe("dashboard lifecycle", () => {
  it("renders compact online/offline machines and the connection error", () => {
    render(
      <Dashboard
        now={now}
        error
        config={{ title: "Lab", order: ["missing", "host"], compactHosts: ["host", "sleeping"] }}
        fleet={{ host: { online: true, metrics: metrics() } }}
      />,
    );
    expect(
      screen.getByText(
        /● host online · CPU 25.0% · RAM 8.0 GiB \/ 16.0 GiB · Disk 100.0 GiB \/ 500.0 GiB/,
      ),
    ).toHaveClass("online");
    expect(screen.getByText("sleeping · offline")).toBeInTheDocument();
    expect(screen.getByText("Telemetry connection lost")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("ages hosts out even when polling fails and cleans up its clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("failed", { status: 503 })));
    client.setQueryData(["fleet"], {
      hosts: { host: { online: true, metrics: metrics() } },
      histories: {},
    });
    const { unmount } = render(<App />, { wrapper: wrapperFor(client) });
    expect(screen.getByRole("article")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(13000);
    });
    expect(screen.getByRole("article")).toHaveClass("offline-machine");
    expect(screen.getByText("host")).toBeInTheDocument();
    const clear = vi.spyOn(globalThis, "clearInterval");
    unmount();
    expect(clear).toHaveBeenCalled();
    client.clear();
  });
  it("does not show a stale featured machine as online", () => {
    render(
      <Dashboard now={now} config={{ featuredHost: "nas" }} fleet={{ nas: { online: false } }} />,
    );
    expect(screen.getByRole("article", { name: "nas machine" })).toHaveClass("offline-machine");
    expect(screen.getByText("nas")).toBeInTheDocument();
  });
});
it("polls UniFi only when enabled and exposes request failures", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(["config"], { networkEnabled: true });
  let failed = false;
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === "/api/network"
            ? { available: true, timestamp: now, devices: [], clients: 19 }
            : {},
        ),
        { status: failed && url === "/api/network" ? 503 : 200 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const { result, unmount } = renderHook(useFleet, { wrapper: wrapperFor(client) });
  await waitFor(() => expect(result.current.network?.clients).toBe(19));
  failed = true;
  await act(async () => {
    await client.refetchQueries({ queryKey: ["network"] });
  });
  await waitFor(() => expect(result.current.networkError).toBe(true));
  unmount();
  client.clear();
});
