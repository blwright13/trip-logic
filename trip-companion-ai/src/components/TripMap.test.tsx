import { act } from "react";
import { createRoot } from "react-dom/client";

import { TripMap } from "./TripMap";

describe("TripMap", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  async function renderTripMap(activities: Parameters<typeof TripMap>[0]["activities"]) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TripMap activities={activities} />);
    });

    return { container, root };
  }

  async function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }

  it("renders an empty-state instead of crashing when there are no mappable activities", async () => {
    const { container, root } = await renderTripMap([]);

    expect(container).toHaveTextContent("No mappable locations");

    await cleanup(root, container);
  });

  it("renders a dependency-free embedded map for the first itinerary location", async () => {
    const { container, root } = await renderTripMap([
      { name: "Coffee", time: "9:00 AM", location: "Cafe de Flore, Paris" },
      { name: "Museum", time: "11:00 AM", location: "Musee d'Orsay, Paris" },
    ]);

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.title).toBe("Map preview for Cafe de Flore, Paris");
    expect(iframe?.src).toContain("https://www.google.com/maps");
    expect(iframe?.src).toContain("Cafe%20de%20Flore%2C%20Paris");
    expect(container).not.toHaveTextContent("Open route in Google Maps");

    await cleanup(root, container);
  });

  it("uses event names in the pin list and focuses the map when an event is clicked", async () => {
    const { container, root } = await renderTripMap([
      { name: "Day at Disneyland Paris", time: "9:00 AM", location: "16 Rue des Archives, 75004 Paris, France" },
      { name: "Louvre visit and gardens", time: "1:00 PM", location: "8 Quai du Louvre, 75001 Paris, France" },
    ]);

    expect(container).toHaveTextContent("Day at Disneyland Paris");
    expect(container).toHaveTextContent("Louvre visit and gardens");
    expect(container).not.toHaveTextContent("16 Rue des Archives");

    const iframeBefore = container.querySelector("iframe");
    expect(iframeBefore?.src).toContain("16%20Rue%20des%20Archives");

    const secondEvent = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Louvre visit and gardens"),
    );
    expect(secondEvent).toBeDefined();

    await act(async () => {
      secondEvent?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const iframeAfter = container.querySelector("iframe");
    expect(iframeAfter?.title).toBe("Map preview for 8 Quai du Louvre, 75001 Paris, France");
    expect(iframeAfter?.src).toContain("8%20Quai%20du%20Louvre");

    await cleanup(root, container);
  });
});
