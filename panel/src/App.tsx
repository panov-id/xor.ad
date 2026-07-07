import { Authenticated, Refine } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Layout } from "./components/layout";
import authProvider from "./providers/auth";
import { dataProvider } from "./providers/data";
import { supabaseClient } from "./providers/supabase-client";
import { LoginPage } from "./pages/login";
import { WaitlistList } from "./pages/waitlist/list";
import { PanelUsersList } from "./pages/panel-users/list";

function App() {
  const refine = (
    <Refine
            dataProvider={dataProvider}
            liveProvider={liveProvider(supabaseClient)}
            authProvider={authProvider}
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
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              projectId: "UdqnOn-kidBre-MGpZrJ",
            }}
          >
            <Routes>
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
                <Route path="/waitlist" element={<WaitlistList />} />
                <Route path="/panel-users" element={<PanelUsersList />} />
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
