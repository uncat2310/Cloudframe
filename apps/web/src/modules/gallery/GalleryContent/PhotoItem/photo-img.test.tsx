import { fireEvent, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";

import { profileGenerationAtom } from "@/modules/settings/profile-generation";
import {
  clearNaturalSizeCacheAtom,
  naturalSizesAtom,
} from "@/stores/atoms/photo-size";

import { PhotoImg } from "./photo-img";

describe("PhotoImg profile replacement", () => {
  it("rejects an old load completion before it can repopulate size or feedback", () => {
    const store = createStore();
    store.set(clearNaturalSizeCacheAtom);
    const setLoadingState = vi.fn();
    const mounted = render(
      <Provider store={store}>
        <PhotoImg
          s3Key="i/old.webp"
          url="https://old.example.com/i/old.webp"
          setLoadingState={setLoadingState}
        />
      </Provider>,
    );
    const image = mounted.getByAltText("i/old.webp");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 640 },
      naturalHeight: { configurable: true, value: 480 },
    });

    store.set(profileGenerationAtom, (generation) => generation + 1);
    fireEvent.load(image);
    fireEvent.error(image);

    expect(store.get(naturalSizesAtom)[0].has("i/old.webp")).toBe(false);
    expect(setLoadingState).not.toHaveBeenCalled();
  });
});

describe("PhotoImg thumbnails", () => {
  it("shows the thumbnail and falls back to the original when it fails", () => {
    const store = createStore();
    store.set(clearNaturalSizeCacheAtom);
    const setLoadingState = vi.fn();
    const mounted = render(
      <Provider store={store}>
        <PhotoImg
          s3Key="i/a.jpg"
          url="https://img.example.com/i/a.jpg"
          thumbnailUrl="https://img.example.com/cdn-cgi/image/width=800/i/a.jpg"
          setLoadingState={setLoadingState}
        />
      </Provider>,
    );
    const image = mounted.getByAltText("i/a.jpg") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(
      "https://img.example.com/cdn-cgi/image/width=800/i/a.jpg",
    );

    fireEvent.error(image);

    const fallback = mounted.getByAltText("i/a.jpg") as HTMLImageElement;
    expect(fallback.getAttribute("src")).toBe(
      "https://img.example.com/i/a.jpg",
    );
    expect(setLoadingState).not.toHaveBeenCalledWith("error");

    fireEvent.error(fallback);
    expect(setLoadingState).toHaveBeenCalledWith("error");
  });
});
