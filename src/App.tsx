/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DualMapViewer from './components/DualMapViewer';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <DualMapViewer />
    </ErrorBoundary>
  );
}
