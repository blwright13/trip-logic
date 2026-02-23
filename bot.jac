import os;
import requests;
import from byllm.lib { Model }


glob llm = Model(
    model_name="gemini/gemini-2.5-flash",
    api_key=os.genenv("GEMINI_API_KEY")
);

node ChatSession {
    has telegram_user_id: str,
        telegram_chat_id: str,
        history: list[dict[str, str]] = [];
}

def answer_user(prompt: str) -> str by llm();
sem answer_user = """
You are replying to a Telegram user.
Use the provided conversation history for context.
Respond conversationally and concisely.
""";

def build_prompt(history: list[dict[str, str]], latest_message: str) -> str {
    lines: list[str] = [];
    for item in history {
        role = str(item.get("role", "user")).upper();
        content = str(item.get("content", ""));
        lines.append(f"{role}: {content}");
    }

    history_text = "\n".join(lines);
    return f"""
Conversation history:
{history_text}

USER: {latest_message}
ASSISTANT:
""";
}


def send_telegram_message(chat_id: str, text: str) -> dict[str, any] {
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN");
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage";

    resp = requests.post(
        url,
        json={"chat_id": chat_id, "text": text},
        timeout=15
    );

    return {
        "status_code": resp.status_code,
        "body": str(resp.text)
    };
}

walker:pub telegram_webhook {
    has update_id: int = 0,
        message: dict[str, any] = {},
        edited_message: dict[str, any] = {},
        telegram_user_id: str = "",
        telegram_chat_id: str = "",
        txt: str = "",
        handled: bool = False;

    can parse_update with Root entry {
        tg_msg = self.message;
        if not tg_msg {
            tg_msg = self.edited_message;
        }

        if not tg_msg {
            report {"status": "ignored", "reason": "No message payload"};
            disengage;
        }

        chat = tg_msg.get("chat", {});
        chat_id = str(chat.get("id", ""));
        from_user = tg_msg.get("from", {});
        user_id = str(from_user.get("id", ""));
        txt = str(tg_msg.get("text", "")).strip();

        if chat_id == "" {
            report {"status": "ignored", "reason": "Missing chat.id"};
            disengage;
        }

        if user_id == "" {
            report {"status": "ignored", "reason": "Missing from.id"};
            disengage;
        }

        if txt == "" {
            send_telegram_message(chat_id, "Text messages only for now.");
            report {"status": "ignored", "reason": "Non-text or empty message"};
            disengage;
        }

        self.telegram_user_id = user_id;
        self.telegram_chat_id = chat_id;
        self.txt = txt;

        visit[-->];
    }

    can reply_existing_session with ChatSession entry {
        if here.telegram_user_id == self.telegram_user_id {
            here.telegram_chat_id = self.telegram_chat_id;

            prompt = build_prompt(here.history, self.txt);
            reply = str(answer_user(prompt)).strip();
            if reply == "" {
                reply = "I couldn't generate a reply right now.";
            }

            here.history.append({"role": "user", "content": self.txt});
            here.history.append({"role": "assistant", "content": reply});

            telegram_resp = send_telegram_message(self.telegram_chat_id, reply);
            self.handled = True;

            report {
                "status": "ok",
                "reply": reply,
                "telegram_response": telegram_resp
            };
            disengage;
        }
    }

    can create_session_and_reply with Root exit {
        if not self.handled {
            session = ChatSession(
                telegram_user_id=self.telegram_user_id,
                telegram_chat_id=self.telegram_chat_id,
                history=[]
            );
            root ++> session;

            prompt = build_prompt(session.history, self.txt);
            reply = str(answer_user(prompt)).strip();
            if reply == "" {
                reply = "I couldn't generate a reply right now.";
            }

            session.history.append({"role": "user", "content": self.txt});
            session.history.append({"role": "assistant", "content": reply});

            telegram_resp = send_telegram_message(self.telegram_chat_id, reply);

            report {
                "status": "ok",
                "reply": reply,
                "telegram_response": telegram_resp,
                "created_session": True
            };
        }
    }
}
