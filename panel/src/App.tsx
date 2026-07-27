import { Authenticated, Refine } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Layout } from "./components/layout";
import { Gated } from "./components/gated";
import authProvider from "./providers/auth";
import { accessControlProvider } from "./providers/access";
import { dataProvider } from "./providers/data";
import { LoginPage } from "./pages/login";
import { AuthCallback } from "./pages/auth-callback";
import { WaitlistList } from "./pages/waitlist/list";
import { PanelUsersList } from "./pages/panel-users/list";
import { ClientErrorsList } from "./pages/logs/client-errors/list";
import { AuditList } from "./pages/logs/audit/list";
import { ServerLogsList } from "./pages/logs/server/list";
import { PageviewsList } from "./pages/logs/pageviews/list";

function App() {
  const refine = (
    <Refine
            dataProvider={dataProvider}
            authProvider={authProvider}
            accessControlProvider={accessControlProvider}
            routerProvider={routerProvider}
            resources={[
              {
                name: "waitlist",
                list: "/waitlist",
                meta: { label: "Waitlist" },
              },
              {
                name: "panel_users",
                list: "/panel-users",
                meta: { label: "Panel users" },
              },
              {
                name: "logs_client_errors",
                list: "/logs/client-errors",
                meta: { label: "Client errors" },
              },
              {
                name: "logs_audit",
                list: "/logs/audit",
                meta: { label: "Audit log" },
              },
              {
                name: "logs_server",
                list: "/logs/server",
                meta: { label: "Server logs" },
              },
              {
                name: "logs_pageviews",
                list: "/logs/pageviews",
                meta: { label: "Page views" },
              },
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              projectId: "UdqnOn-kidBre-MGpZrJ",
            }}
          >
            <Routes>
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route
                element={
                  <Authenticated key="authenticated" fallback={<CatchAllNavigate to="/login" />}>
                    <Layout>
                      <Outlet />
                    </Layout>
                  </Authenticated>
                }
              >
                <Route index element={<NavigateToResource resource="waitlist" />} />
                <Route
                  path="/waitlist"
                  element={
                    <Gated resource="waitlist">
                      <WaitlistList />
                    </Gated>
                  }
                />
                <Route
                  path="/panel-users"
                  element={
                    <Gated resource="panel_users">
                      <PanelUsersList />
                    </Gated>
                  }
                />
                <Route
                  path="/logs/client-errors"
                  element={
                    <Gated resource="logs_client_errors">
                      <ClientErrorsList />
                    </Gated>
                  }
                />
                <Route
                  path="/logs/audit"
                  element={
                    <Gated resource="logs_audit">
                      <AuditList />
                    </Gated>
                  }
                />
                <Route
                  path="/logs/server"
                  element={
                    <Gated resource="logs_server">
                      <ServerLogsList />
                    </Gated>
                  }
                />
                <Route
                  path="/logs/pageviews"
                  element={
                    <Gated resource="logs_pageviews">
                      <PageviewsList />
                    </Gated>
                  }
                />
              </Route>
              <Route
                element={
                  <Authenticated key="auth-pages" fallback={<Outlet />}>
                    <NavigateToResource resource="waitlist" />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<LoginPage />} />
              </Route>
            </Routes>
            <RefineKbar />
            <UnsavedChangesNotifier />
            <DocumentTitleHandler />
          </Refine>
  );

  return (
    <BrowserRouter>
      <RefineKbarProvider>
        {/* Devtools only in development — never wrap the production bundle. */}
        {import.meta.env.DEV ? (
          <DevtoolsProvider>
            {refine}
            <DevtoolsPanel />
          </DevtoolsProvider>
        ) : (
          refine
        )}
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
