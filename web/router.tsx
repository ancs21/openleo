import { createBrowserRouter, Navigate, useParams } from "react-router";
import { AgentList } from "./features/agents/AgentList";
import { AgentPage } from "./features/agents/AgentPage";
import { AgentsPanel } from "./features/agents/AgentsPanel";
import { LoginPage } from "./features/auth/LoginPage";
import { BoardPage } from "./features/board/BoardPage";
import { lastBoard, MAIN_BOARD } from "./features/board/store";
import { RootLayout } from "./layouts/RootLayout";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Navigate to={`/b/${lastBoard()}`} replace /> },
      // The board stays mounted while a card or its agents open beside it (card/:num only sets the URL).
      {
        path: "/b/:boardId",
        element: <BoardPage />,
        children: [
          { path: "card/:num" },
          {
            path: "agents", // agents belong to a board: they're managed in a panel on it
            element: <AgentsPanel />,
            children: [
              { index: true, element: <AgentList /> },
              { path: "new", element: <AgentPage /> },
              { path: ":name", element: <AgentPage /> },
              { path: ":name/c/:conversationId", element: <AgentPage /> },
            ],
          },
        ],
      },
      { path: "/card/:num", element: <LegacyCardLink /> }, // links from before there were several boards
      { path: "/agents/*", element: <LegacyAgentsLink /> }, // links from before agents belonged to a board
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

function LegacyAgentsLink() {
  const rest = useParams()["*"];
  return <Navigate to={`/b/${lastBoard()}/agents/${rest || "new"}`} replace />;
}

function LegacyCardLink() {
  const { num } = useParams();
  return <Navigate to={`/b/${MAIN_BOARD}/card/${num}`} replace />;
}
