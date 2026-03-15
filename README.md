# TripLogic

AI-powered trip planning application.

## Run

```bash
jac serve main.jac
```

## Backend Connection Status

The frontend is currently **not connected** to backend walkers. All data is hardcoded.

### What Needs to Be Connected

| Feature | Frontend Method | Backend Walker | Status |
|---------|----------------|----------------|--------|
| Chat responses | `sendMessage()` | `SendChatMessage` | Not connected |
| Save trip edits | `saveTrip()` | `UpdateTrip` | Not connected |
| Load trip | - | `GetTrip` | Not connected |
| Create trip | - | `AddTrip` | Not connected |
| Generate itinerary | - | `GetItinerary` | Not connected |

### How to Connect

1. Add server imports to `frontend.cl.jac`:
```jac
sv import from main {
    AddTrip, GetTrip, UpdateTrip, ListTrips,
    SendChatMessage, GetItinerary
}
```

2. Update methods in `frontend.impl.jac` to spawn walkers:
```jac
impl app.sendMessage(text: str) -> None {
    userMsg = {"id": Math.random().toString(), "role": "user", "text": text};
    chatMessages = chatMessages + [userMsg];

    result = root spawn SendChatMessage(trip_id="current", message=text);
    if result.reports {
        response = result.reports[0];
        aiMsg = {"id": Math.random().toString(), "role": "ai", "text": response.ai_response, "chips": response.chips};
        chatMessages = chatMessages + [aiMsg];
    }
    chatInput = "";
}
```

## File Structure

```
trip-logic/
  main.jac              # Backend walkers
  frontend.cl.jac       # Main app state + routing
  frontend.impl.jac     # Method implementations
  styles.css            # Styles
  components/           # 11 reusable UI components
  pages/                # 3 page components
```
