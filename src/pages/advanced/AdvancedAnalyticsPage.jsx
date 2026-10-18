import { Navigate } from "react-router-dom";
import { Analytics } from "../dashboard/Analytics.jsx";

export function AdvancedAnalyticsPage(props) {
  if (!props.user) return <Navigate to="/login" replace />;
  return <Analytics {...props} />;
}
