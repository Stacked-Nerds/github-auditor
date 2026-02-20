# GitHub Auditor (Open Source Security Edition)

**GitHub Auditor** is a powerful, open-source tool designed to audit, visualize, and improve the security posture of GitHub organizations. It streams data in real-time to handle large organizations without hitting rate limits, providing actionable insights into repositories, branches, users, and teams.

<p align="center">
  <img src="frontend/public/logo-full.png" alt="GitHub Auditor Dashboard" width="500" />
</p>

## 🚀 Key Features

- **🛡️ Real-time Security Audit**: Streaming analysis of repositories for `CODEOWNERS`, branch protection, and admin exposure.
- **🌿 Stale Branch Detection**: Identify and clean up branches that have been inactive for over 90 days.
- **busts Inactive Users**: Find organization members who haven't been active in 3+ months or are using personal email domains.
- **👻 Orphaned Teams**: Detect teams with 0 members that are cluttering your organization.
- **📊 Executive Reports**: Generate high-resolution, "Pitch Black" themed PDF reports for leadership, or export raw data to CSV.
- **🌗 Dark/Light Mode**: Fully responsive UI with a premium "Pitch Black" dark mode and a clean, high-contrast light mode.
- **⚡ Zero Rate-Limit Issues**: Built on an SSE (Server-Sent Events) architecture to handle thousands of repositories gracefully.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), Tailwind CSS v4, Zustand, Lucide React
- **Backend**: FastAPI (Python), Server-Sent Events (SSE), AsyncIO
- **Persistence**: IndexedDB (`localforage`) for handling large datasets client-side
- **PDF Generation**: `html-to-image` + `jspdf` for pixel-perfect reports

## 📦 Installation

### Prerequisites

- Node.js 18+
- Python 3.10+
- A GitHub Personal Access Token (Classic) with `repo` and `admin:org` scopes.

### 1. Clone the Repository

```bash
git clone https://github.com/Stacked-Nerds/github-auditor.git
cd github-auditor
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to start auditing!

## 🔒 Security

This tool runs locally on your machine. Your GitHub Personal Access Token (PAT) is:
- **Never sent to any third-party server.**
- **Stored only in your browser's session storage.**
- **Used directly by the local backend to query GitHub's API.**

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
