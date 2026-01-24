"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ChatSDKError } from "@/lib/errors";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RefreshCwIcon, FileTextIcon, CheckCircleIcon, XCircleIcon, ClockIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, EyeIcon, FolderIcon, FolderOpenIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { RESOURCE_STATUS } from "@/lib/db/resources/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Resource {
  id: string;
  filename: string;
  folder: string;
  contentType: string;
  status: keyof typeof RESOURCE_STATUS;
  createdAt: string;
  updatedAt: string;
}

interface GroupedResourcesResponse {
  folders: Record<string, Resource[]>;
  totalFolders: number;
  totalResources: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface PaginatedResources {
  resources: Resource[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const STATUS_COLORS = {
  PROCESSING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  COMPLETED_WITH_ERRORS: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
} as const;

const STATUS_ICONS = {
  PROCESSING: ClockIcon,
  COMPLETED: CheckCircleIcon,
  COMPLETED_WITH_ERRORS: XCircleIcon,
  FAILED: XCircleIcon,
} as const;

export default function EmbeddingsPage() {
  const { data: session, status } = useSession();
  const [groupedData, setGroupedData] = useState<GroupedResourcesResponse | null>(null);
  const [paginatedData, setPaginatedData] = useState<PaginatedResources | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingResource, setDeletingResource] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [previewResourceId, setPreviewResourceId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const isInitialMount = useRef(true);

  const fetchResources = useCallback(async (page = currentPage, search = searchQuery) => {
    try {
      setIsRefreshing(true);

      if (search) {
        // When searching, use paginated view
        const data = await apiClient.get<PaginatedResources>(
          `/api/resources?page=${page}&limit=50&search=${encodeURIComponent(search)}`
        );
        setPaginatedData(data);
        setGroupedData(null);
      } else {
        // When not searching, use grouped view with pagination
        const data = await apiClient.get<GroupedResourcesResponse>(
          `/api/resources?grouped=true&page=${page}&foldersPerPage=10&filesPerFolder=100`
        );
        setGroupedData(data);
        setPaginatedData(null);
        // Expand all folders by default
        setExpandedFolders(new Set(Object.keys(data.folders)));
      }

      setCurrentPage(page);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to fetch resources");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [currentPage, searchQuery]);

  // Handle search changes (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) return;
    
    const timeoutId = setTimeout(() => {
      fetchResources(1, searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const deleteResource = useCallback(async (resourceId: string) => {
    try {
      setDeletingResource(resourceId);
      await apiClient.delete(`/api/resources?id=${resourceId}`);
      toast.success("Resource deleted successfully");
      await fetchResources(currentPage, searchQuery);
    } catch (error) {
      console.error("Delete error:", error);
      if (error instanceof ChatSDKError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete resource");
      }
    } finally {
      setDeletingResource(null);
    }
  }, [fetchResources, currentPage, searchQuery]);

  const deleteFolder = useCallback(async (folder: string) => {
    try {
      setDeletingFolder(folder);
      const result = await apiClient.delete<{ success: boolean; deletedCount: number; folder: string }>(
        `/api/resources?folder=${encodeURIComponent(folder)}`
      );
      toast.success(`Deleted ${result.deletedCount} resources from "${folder}"`);
      await fetchResources(currentPage, searchQuery);
    } catch (error) {
      console.error("Delete folder error:", error);
      if (error instanceof ChatSDKError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to delete folder");
      }
    } finally {
      setDeletingFolder(null);
    }
  }, [fetchResources, currentPage, searchQuery]);

  const openPreview = useCallback(async (resourceId: string, filename: string) => {
    setPreviewResourceId(resourceId);
    setPreviewFilename(filename);
    setPreviewContent(null);
    setIsLoadingPreview(true);
    try {
      const data = await apiClient.get<{ content: string; filename: string; contentType: string }>(`/api/resources/${resourceId}/preview`);
      setPreviewContent(data.content);
    } catch (error) {
      console.error("Preview error:", error);
      if (error instanceof ChatSDKError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to load preview");
      }
      setPreviewResourceId(null);
      setPreviewFilename(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const toggleFolder = useCallback((folder: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folder)) {
        newSet.delete(folder);
      } else {
        newSet.add(folder);
      }
      return newSet;
    });
  }, []);

  // Initial load - only once
  useEffect(() => {
    fetchResources(1, "");
    isInitialMount.current = false;
  }, []);

  const totalResources = useMemo(() => {
    if (searchQuery && paginatedData) {
      return paginatedData.total;
    }
    if (groupedData) {
      return groupedData.totalResources;
    }
    return 0;
  }, [searchQuery, paginatedData, groupedData]);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect("/login?callbackUrl=/embeddings");
  }

  const renderResource = (resource: Resource) => {
    const StatusIcon = STATUS_ICONS[resource.status];
    const statusColor = STATUS_COLORS[resource.status];
    
    return (
      <div
        key={resource.id}
        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors ml-6"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <StatusIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => openPreview(resource.id, resource.filename)}
              className="text-sm font-medium hover:text-primary transition-colors text-left cursor-pointer flex items-center gap-2"
              title="Click to preview"
            >
              <EyeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{resource.filename}</span>
            </button>
            <p className="text-xs text-muted-foreground">
              {resource.contentType} • {new Date(resource.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${statusColor}`}>
            {resource.status.replace(/_/g, " ")}
          </Badge>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                disabled={deletingResource === resource.id}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Resource</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{resource.filename}"? This action will permanently delete the file and all its associated embeddings. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteResource(resource.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletingResource === resource.id ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2 -mx-6 -mt-6 mb-6">
        <SidebarToggle />
      </header>
      
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Embeddings Management</h1>
        <p className="text-sm text-muted-foreground">
          View and manage your documents. Embeddings are generated by the Dagster pipeline.
        </p>
      </div>

      {/* Resources List */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileTextIcon className="h-4 w-4" />
                Uploaded Resources
              </CardTitle>
              <CardDescription className="text-sm">
                View the status of your documents and their processing progress. Embeddings are generated by the Dagster pipeline.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => fetchResources(currentPage, searchQuery)}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
              >
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search Bar */}
          <div className="relative mb-6">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Input
              type="text"
              placeholder="Search files or folders..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>

          {(!groupedData && !paginatedData) || (searchQuery && paginatedData?.resources.length === 0) || (!searchQuery && groupedData && Object.keys(groupedData.folders).length === 0) ? (
            <div className="text-center py-6 text-muted-foreground">
              <FileTextIcon className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No resources found</p>
              <p className="text-xs">
                {searchQuery ? "Try a different search term" : "Resources are created by the Dagster pipeline"}
              </p>
            </div>
          ) : searchQuery && paginatedData ? (
            // Search results - paginated list
            <>
              <div className="space-y-3">
                {paginatedData.resources.map(renderResource)}
              </div>
              
              {/* Pagination - Always show when searching */}
              {paginatedData.total > 0 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {((paginatedData.currentPage - 1) * 50) + 1} to {Math.min(paginatedData.currentPage * 50, paginatedData.total)} of {paginatedData.total} results
                  </div>
                  {paginatedData.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchResources(currentPage - 1, searchQuery)}
                        disabled={!paginatedData.hasPrevPage || isRefreshing}
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {paginatedData.currentPage} of {paginatedData.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchResources(currentPage + 1, searchQuery)}
                        disabled={!paginatedData.hasNextPage || isRefreshing}
                      >
                        Next
                        <ChevronRightIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : groupedData ? (
            // Grouped by folder view
            <>
              <div className="text-sm text-muted-foreground mb-4">
                {totalResources} {totalResources === 1 ? "resource" : "resources"} in {groupedData.totalFolders} {groupedData.totalFolders === 1 ? "folder" : "folders"}
              </div>
              <div className="space-y-2">
                {Object.entries(groupedData.folders)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([folder, files]) => {
                    const isExpanded = expandedFolders.has(folder);
                    return (
                      <Collapsible
                        key={folder}
                        open={isExpanded}
                        onOpenChange={() => toggleFolder(folder)}
                      >
                        <div className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                            {isExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                            {isExpanded ? (
                              <FolderOpenIcon className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FolderIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium flex-1 text-left">{folder || "Other"}</span>
                            <Badge variant="outline" className="text-xs">
                              {files.length} {files.length === 1 ? "file" : "files"}
                            </Badge>
                          </CollapsibleTrigger>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                disabled={deletingFolder === folder}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <TrashIcon className="h-4 w-4 mr-1" />
                                <span className="text-xs">Delete All</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Entire Folder</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete all {files.length} resources in "{folder}"? This action will permanently delete all files and their associated embeddings. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteFolder(folder)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {deletingFolder === folder ? "Deleting..." : `Delete ${files.length} files`}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                        <CollapsibleContent>
                          <div className="space-y-2 mt-2">
                            {files.map(renderResource)}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
              </div>

              {/* Folder Pagination */}
              {groupedData.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing folders {((groupedData.currentPage - 1) * 10) + 1} to {Math.min(groupedData.currentPage * 10, groupedData.totalFolders)} of {groupedData.totalFolders}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchResources(currentPage - 1, searchQuery)}
                      disabled={!groupedData.hasPrevPage || isRefreshing}
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {groupedData.currentPage} of {groupedData.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchResources(currentPage + 1, searchQuery)}
                      disabled={!groupedData.hasNextPage || isRefreshing}
                    >
                      Next
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewResourceId !== null} onOpenChange={(open) => {
        if (!open) {
          setPreviewResourceId(null);
          setPreviewContent(null);
          setPreviewFilename(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewFilename || "Document Preview"}</DialogTitle>
            <DialogDescription>
              Preview of the document content from embeddings
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCwIcon className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading preview...</span>
              </div>
            ) : previewContent !== null ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm bg-muted/50 p-4 rounded-lg border">
                  {previewContent}
                </pre>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
