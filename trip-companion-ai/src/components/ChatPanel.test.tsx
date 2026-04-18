import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
});
