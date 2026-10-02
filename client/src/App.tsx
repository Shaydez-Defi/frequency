import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.js';
import { DraftProvider, useDraft } from './semesters/draft.js';
import { Landing } from './screens/Landing.js';
import { Login } from './screens/Auth.js';
import { CompleteProfile } from './screens/CompleteProfile.js';
import { Dashboard } from './screens/Dashboard.js';
import { EditSemester } from './screens/EditSemester.js';
import { Profile } from './screens/Profile.js';
import { SemesterSetup } from './screens/SemesterSetup.js';
import { CourseEntry } from './screens/CourseEntry.js';
import { Review } from './screens/Review.js';
import { Result } from './screens/Result.js';
import { SemesterDetails } from './screens/SemesterDetails.js';
import { ResultSheet } from './screens/ResultSheet.js';
import type { JSX } from 'react';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireSetup({ children }: { children: JSX.Element }) {
  const { started } = useDraft();
  if (!started) return <Navigate to="/semesters/new" replace />;
  return children;
}

function RequireSemesterId({ children }: { children: JSX.Element }) {
  const { id } = useParams();
  if (!id) return <Navigate to="/dashboard" replace />;
  return children;
}

export function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/semesters/:id"
          element={
            <RequireAuth>
              <RequireSemesterId>
                <SemesterDetails />
              </RequireSemesterId>
            </RequireAuth>
          }
        />
        <Route
          path="/semesters/:id/result"
          element={
            <RequireAuth>
              <RequireSemesterId>
                <ResultSheet />
              </RequireSemesterId>
            </RequireAuth>
          }
        />
        <Route
          path="/semesters/:id/edit"
          element={
            <RequireAuth>
              <RequireSemesterId>
                <EditSemester />
              </RequireSemesterId>
            </RequireAuth>
          }
        />
        <Route
          path="/semesters/new"
          element={
            <RequireAuth>
              <DraftProvider>
                <Outlet />
              </DraftProvider>
            </RequireAuth>
          }
        >
          <Route index element={<SemesterSetup />} />
          <Route
            path="courses"
            element={
              <RequireSetup>
                <CourseEntry />
              </RequireSetup>
            }
          />
          <Route
            path="review"
            element={
              <RequireSetup>
                <Review />
              </RequireSetup>
            }
          />
          <Route path="result" element={<Result />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
