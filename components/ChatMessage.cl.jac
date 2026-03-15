"""Chat bubble component."""

def:pub ChatMessage(msg: dict, onChipClick: any) -> any {
    return
        <div className={("flex " + ("justify-end" if msg.role == "user" else "justify-start"))}>
            <div className="chat-message space-y-2">
                <div className={("chat-bubble " + ("chat-bubble-user" if msg.role == "user" else "chat-bubble-ai"))}>
                    {msg.text}
                </div>
                {(
                    <div className="flex flex-wrap gap-1.5">
                        {[
                            <button
                                key={chip}
                                onClick={lambda -> None { onChipClick(chip); }}
                                className="chip"
                            >
                                {chip}
                            </button>
                            for chip in msg.chips
                        ]}
                    </div>
                ) if msg.chips else None}
            </div>
        </div>;
}
