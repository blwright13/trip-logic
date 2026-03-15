"""Chat input form component."""

import from "lucide-react" { Send }

def:pub ChatInput(value: str, onChange: any, onSubmit: any) -> any {
    return
        <form onSubmit={onSubmit} className="p-3 border-t border-border bg-card">
            <div className="chat-input-wrapper">
                <input
                    value={value}
                    onChange={onChange}
                    placeholder="Ask about your trip..."
                />
                <button type="submit" className="chat-send-btn" disabled={not value.trim()}>
                    {<Send size={16} />}
                </button>
            </div>
        </form>;
}
