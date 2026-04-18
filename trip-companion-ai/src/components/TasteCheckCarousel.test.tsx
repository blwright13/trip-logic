import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TasteCheckCarousel from "./TasteCheckCarousel";
import type { TastePlaceSuggestion } from "@/services/api";

const suggestions: TastePlaceSuggestion[] = [
  {
    id: "1",
    name: "Le Ju'",
    address: "16 Rue des Archives, Paris",
    rating: 4.4,
    price_level: "PRICE_LEVEL_MODERATE",
    photo_url: "/api/places/photo?name=places/1/photos/abc",
    description: "A lively modern bistro known for seasonal French plates and a neighborhood dinner crowd.",
    types: ["restaurant", "food"],
    query: "best restaurants in Paris",
  },
  {
    id: "2",
    name: "Chouchou",
    address: "23 Bd de Sebastopol, Paris",
    rating: null,
    price_level: "PRICE_LEVEL_EXPENSIVE",
    types: ["bar", "restaurant"],
    description: "A stylish cocktail bar and restaurant popular for polished small plates and late-night energy.",
    query: "best restaurants in Paris",
  },
  {
    id: "3",
    name: "Musee d'Orsay",
    address: "Esplanade Valery Giscard d'Estaing, Paris",
    rating: 4.8,
    price_level: null,
    types: ["museum", "tourist_attraction"],
    description: "A landmark museum known for Impressionist masterpieces inside a dramatic former railway station.",
    query: "famous museums and culture in Paris",
  },
];

describe("TasteCheckCarousel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows one taste card at a time and moves with arrows", () => {
    render(
      <TasteCheckCarousel
        suggestions={suggestions}
        votes={{}}
        isLoading={false}
        configured
        isSubmitting={false}
        onVote={() => {}}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );

    expect(screen.getByText("Le Ju'")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /taste check cards/i })).toHaveClass("w-[70%]");
    expect(screen.queryByText("Chouchou")).not.toBeInTheDocument();
    expect(screen.getByAltText("Le Ju'")).toHaveAttribute("src", suggestions[0].photo_url);
    expect(screen.getByAltText("Le Ju'")).toHaveClass("w-full");
    expect(screen.getByAltText("Le Ju'")).toHaveClass("h-auto");
    expect(screen.getByAltText("Le Ju'")).not.toHaveClass("max-h-56");
    expect(screen.getByText(suggestions[0].description!)).toBeInTheDocument();
    expect(screen.getByText("Cost: $$")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next place/i }));

    expect(screen.queryByText("Le Ju'")).not.toBeInTheDocument();
    expect(screen.getByText("Chouchou")).toBeInTheDocument();
    expect(screen.getByText("Cost: $$$")).toBeInTheDocument();
  });

  it("does not preload taste card images", () => {
    const loadedSources: string[] = [];
    class MockImage {
      set src(value: string) {
        loadedSources.push(value);
      }
    }
    vi.stubGlobal("Image", MockImage);

    render(
      <TasteCheckCarousel
        suggestions={[
          suggestions[0],
          { ...suggestions[1], photo_url: "/api/places/photo?name=places/2/photos/def" },
          suggestions[2],
        ]}
        votes={{}}
        isLoading={false}
        configured
        isSubmitting={false}
        onVote={() => {}}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );

    expect(loadedSources).toEqual([]);
  });

  it("moves between cards with global keyboard arrow keys", () => {
    render(
      <TasteCheckCarousel
        suggestions={suggestions}
        votes={{}}
        isLoading={false}
        configured
        isSubmitting={false}
        onVote={() => {}}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Chouchou")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Le Ju'")).toBeInTheDocument();
  });

  it("moves only one card when arrow keys are pressed while the card is focused", () => {
    render(
      <TasteCheckCarousel
        suggestions={suggestions}
        votes={{}}
        isLoading={false}
        configured
        isSubmitting={false}
        onVote={() => {}}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );

    const card = screen.getByRole("group", { name: /taste check cards/i });
    card.focus();
    fireEvent.keyDown(card, { key: "ArrowRight" });

    expect(screen.getByText("Chouchou")).toBeInTheDocument();
    expect(screen.queryByText("Musee d'Orsay")).not.toBeInTheDocument();
  });

  it("submits like and dislike votes for the visible card", () => {
    const onVote = vi.fn();
    render(
      <TasteCheckCarousel
        suggestions={suggestions}
        votes={{}}
        isLoading={false}
        configured
        isSubmitting={false}
        onVote={onVote}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^like le ju'$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^dislike le ju'$/i }));

    expect(onVote).toHaveBeenNthCalledWith(1, suggestions[0], "liked");
    expect(onVote).toHaveBeenNthCalledWith(2, suggestions[0], "disliked");
  });

  it("labels the primary submit action as saving preferences", () => {
    render(
      <TasteCheckCarousel
        suggestions={suggestions}
        votes={{}}
        isLoading={false}
        configured
        isSubmitting={false}
        onVote={() => {}}
        onContinue={() => {}}
        onSkip={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /save preferences/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue with my ratings/i })).not.toBeInTheDocument();
  });
});
