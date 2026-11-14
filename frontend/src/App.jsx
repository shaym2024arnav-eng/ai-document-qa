import { useState } from "react";
import axios from "axios";
import "./App.css";

// Set VITE_API_URL in frontend/.env locally, or in Vercel when deployed.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const API_URL = `${API_BASE_URL}/api/documents`;

function App() {
  const [file, setFile] = useState(null);
  const [docId, setDocId] = useState(null);
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${API_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocId(res.data.id);
      setDocName(res.data.filename);
      setMessages([]);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question || !docId) return;

    const userMessage = { role: "user", text: question };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    setAsking(true);

    try {
      const res = await axios.post(`${API_URL}/${docId}/ask`, { question });
      const botMessage = {
        role: "bot",
        text: res.data.answer,
        sources: res.data.sources,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Error: " + err.message },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="app">
      <h1>AI Document Q&A</h1>

      <div className="upload-section">
        <input type="file" accept=".pdf" onChange={handleFileChange} />
        <button onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? "Processing..." : "Upload PDF"}
        </button>
        {docName && <p className="doc-loaded">📄 Loaded: {docName}</p>}
      </div>

      {docId && (
        <div className="chat-section">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <p>{msg.text}</p>
                {msg.sources && (
                  <details className="sources">
                    <summary>View sources</summary>
                    {msg.sources.map((src, j) => (
                      <div key={j} className="source-chunk">
                        <span className="score">
                          Score: {src.score.toFixed(2)}
                        </span>
                        <p>{src.text}</p>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}
            {asking && <div className="message bot">Thinking...</div>}
          </div>

          <form onSubmit={handleAsk} className="ask-form">
            <input
              type="text"
              placeholder="Ask a question about the document..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button type="submit" disabled={asking}>
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;