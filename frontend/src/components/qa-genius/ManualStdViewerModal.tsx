import { ClipboardList } from "lucide-react";
import { ManualStdRecord } from "../../types";
import ManualStdTable from "./ManualStdTable";
import Modal from "../ui/Modal";

/** Read-only viewer for a saved Manual STD — shared by Test Repository and
 * History so the two lists open the exact same dialog instead of each
 * maintaining its own copy. */
export default function ManualStdViewerModal({ std, onClose }: { std: ManualStdRecord; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={std.feature_name}
      icon={ClipboardList}
      iconClassName="text-teal-400"
      size="xl"
      bodyClassName="flex-1 min-h-0 overflow-hidden p-5 flex flex-col"
    >
      <ManualStdTable
        testCases={std.test_cases}
        coverage={std.coverage}
        featureName={std.feature_name}
        domain={std.domain}
        model={std.model}
        isMock={std.is_mock}
      />
    </Modal>
  );
}
