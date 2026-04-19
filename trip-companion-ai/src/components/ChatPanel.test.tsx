import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChatPanel, { type ChatMessage } from "./ChatPanel";

const trip = {
  destination: "Paris",
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  budget: 0,
  travelers: 1,
};

describe("ChatPanel", () => {
  it("renders markdown bold markers as bold text in assistant messages", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "ai",
        text: "Your itinerary **Parisian Dream Escape** is ready!",
      },
    ];

    render(
      <ChatPanel
        messages={messages}
        trip={trip}
        onSend={() => {}}
        onTripUpdate={() => {}}
        onChipClick={() => {}}
      />,
    );

    const boldTitle = screen.getByText("Parisian Dream Escape");
    expect(boldTitle.tagName).toBe("STRONG");
  });

  it("renders replace action for suggestion cards with replace metadata", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "ai",
        text: "Here are 5 places to eat in NYC.",
        cards: [
          {
            type: "food",
            title: "Isla & Co. - Midtown",
            apply_mode: "replace",
            replace_activity_id: 42,
            replace_category: "food",
            target_date: "2026-06-02",
          },
        ],
      },
    ];

    render(
      <ChatPanel
        messages={messages}
        trip={trip}
        onSend={() => {}}
        onTripUpdate={() => {}}
        onChipClick={() => {}}
        onApplySuggestion={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument();
  });

  it("uses numeric estimated cost when applying a hotel suggestion", () => {
    const onApplySuggestion = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "ai",
        text: "Here are 5 places to stay in NYC.",
        cards: [
          {
            type: "hotel",
            title: "Hotel option",
            estimated_price: "$1,600 total",
            estimated_cost: 1600,
            apply_mode: "replace",
            replace_activity_id: 42,
            replace_category: "hotel",
            target_date: "2026-06-01",
          },
        ],
      },
    ];

    render(
      <ChatPanel
        messages={messages}
        trip={trip}
        onSend={() => {}}
        onTripUpdate={() => {}}
        onChipClick={() => {}}
        onApplySuggestion={onApplySuggestion}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /replace/i }));

    expect(onApplySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "hotel",
        cost: 1600,
      }),
    );
  });

  it("defaults unqualified suggestion card actions to add", () => {
    const onApplySuggestion = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "ai",
        text: "I found Statue of Liberty.",
        cards: [
          {
            type: "tour",
            title: "Statue of Liberty",
            estimated_price: "$$",
            target_date: "2026-06-03",
          },
        ],
      },
    ];

    render(
      <ChatPanel
        messages={messages}
        trip={trip}
        onSend={() => {}}
        onTripUpdate={() => {}}
        onChipClick={() => {}}
        onApplySuggestion={onApplySuggestion}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /\badd\b/i }));

    expect(onApplySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        apply_mode: "add",
        category: "sightseeing",
      }),
    );
  });
});
