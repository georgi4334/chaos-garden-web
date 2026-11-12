import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { forgetGarden, saveGarden, useSavedGardens } from "./saved-gardens";

const KEY = "chaos-garden:gardens";

describe("saved gardens", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSavedGardens());
    expect(result.current).toEqual([]);
  });

  it("saves newest first, without duplicates, and updates subscribers", () => {
    const { result } = renderHook(() => useSavedGardens());
    act(() => {
      saveGarden({ id: "a", name: "A", token: "ta" });
      saveGarden({ id: "b", name: "B", token: "tb" });
      saveGarden({ id: "a", name: "A renamed", token: "ta" });
    });
    expect(result.current.map((g) => g.name)).toEqual(["A renamed", "B"]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toHaveLength(2);
  });

  it("forgets a garden", () => {
    const { result } = renderHook(() => useSavedGardens());
    act(() => {
      saveGarden({ id: "a", name: "A", token: "ta" });
      saveGarden({ id: "b", name: "B", token: "tb" });
      forgetGarden("a");
    });
    expect(result.current.map((g) => g.id)).toEqual(["b"]);
  });

  it("treats damaged storage as empty", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(renderHook(() => useSavedGardens()).result.current).toEqual([]);
    window.localStorage.setItem(KEY, JSON.stringify({ not: "a list" }));
    expect(renderHook(() => useSavedGardens()).result.current).toEqual([]);
  });
});
