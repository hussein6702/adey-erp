"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { supabase } from "@/lib/supabase";
import { format, startOfWeek } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, FileText, Trash2, Bell, ClipboardList, Eye, Filter, CheckCircle2 } from "lucide-react";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_INDEX = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };

function getDaysUntilNext(dayName) {
  const today = new Date();
  const targetDay = DAY_INDEX[dayName] ?? 1;
  const todayDay = today.getDay();
  let diff = targetDay - todayDay;
  if (diff <= 0) diff += 7;
  return diff;
}

export default function WeeklyReviewsPage() {
  // ---------- Auth ----------
  const [authUser, setAuthUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.authenticated) setAuthUser(d.user);
    }).finally(() => setAuthLoaded(true));
  }, []);
  const isRoot = authUser?.role?.toLowerCase() === "root" || authUser?.role?.toLowerCase() === "admin";

  const { data: reviews = [], isLoading } = useSWR("weekly-reviews", async () => {
    const { data } = await supabase.from("weekly_reviews").select("*").order("created_at", { ascending: false });
    return data || [];
  });

  const { data: responses = [] } = useSWR("weekly-review-responses", async () => {
    const { data } = await supabase.from("weekly_review_responses").select("*, staff:staff_id(full_name)").order("created_at", { ascending: false });
    return data || [];
  });

  const { data: staffList = [] } = useSWR("reviews-staff", async () => {
    const { data } = await supabase.from("staff").select("id, full_name, department, user_id").eq("status", "active").order("full_name");
    return data || [];
  });

  // Filter for responses tab
  const [responseFilter, setResponseFilter] = useState("all");

  // Create review form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewDesc, setReviewDesc] = useState("");
  const [fillDay, setFillDay] = useState("MONDAY");
  const [notifyDays, setNotifyDays] = useState("3");
  const [assignedDept, setAssignedDept] = useState("all");
  const [questions, setQuestions] = useState([{ id: "q1", question: "", type: "paragraph" }]);

  // Fill review dialog
  const [fillReviewId, setFillReviewId] = useState(null);
  const [fillAnswers, setFillAnswers] = useState({});
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // View responses modal
  const [viewReviewId, setViewReviewId] = useState(null);
  const viewReview = reviews.find(r => r.id === viewReviewId);
  const viewResponses = responses.filter(r => r.review_id === viewReviewId);

  // Resolve current staff's UUID
  const myStaffRecord = staffList.find(s =>
    s.user_id === authUser?.sub || s.full_name?.toLowerCase() === authUser?.username?.toLowerCase()
  );
  const myStaffId = myStaffRecord?.id;
  const myDepartment = myStaffRecord?.department || authUser?.department;

  const addQuestion = () => {
    setQuestions([...questions, { id: `q${Date.now()}`, question: "", type: "paragraph" }]);
  };

  const updateQuestion = (id, field, value) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const removeQuestion = (id) => {
    if (questions.length > 1) setQuestions(questions.filter(q => q.id !== id));
  };

  const handleCreateReview = async (e) => {
    e.preventDefault();
    if (!reviewTitle.trim() || questions.some(q => !q.question.trim())) {
      alert("Please fill the title and all questions."); return;
    }
    setIsSubmitting(true);
    try {
      await supabase.from("weekly_reviews").insert({
        title: reviewTitle,
        description: reviewDesc,
        questions: JSON.stringify(questions),
        fill_day: fillDay,
        notify_days_before: parseInt(notifyDays) || 3,
        assigned_department: assignedDept === "all" ? null : assignedDept,
        created_by: "Admin",
        is_active: true,
      });
      setReviewTitle(""); setReviewDesc(""); setFillDay("MONDAY"); setNotifyDays("3");
      setAssignedDept("all"); setQuestions([{ id: "q1", question: "", type: "paragraph" }]);
      setIsFormOpen(false);
      mutate("weekly-reviews");
    } catch (err) {
      console.error(err); alert("Failed to create review template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (id, current) => {
    await supabase.from("weekly_reviews").update({ is_active: !current }).eq("id", id);
    mutate("weekly-reviews");
  };

  // Submit filled review response
  const handleFillSubmit = async (e) => {
    e.preventDefault();
    if (!myStaffId) {
      alert("Error: Active staff profile not found for logged in user.");
      return;
    }
    setIsSubmittingResponse(true);
    try {
      const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      await supabase.from("weekly_review_responses").insert({
        review_id: fillReviewId,
        staff_id: myStaffId,
        answers: JSON.stringify(fillAnswers),
        week_start: weekStartStr,
        status: "submitted",
      });
      setFillReviewId(null);
      setFillAnswers({});
      mutate("weekly-review-responses");
    } catch (err) {
      console.error(err);
      alert("Failed to submit weekly review. You may have already submitted one for this week.");
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  const currentFillReview = reviews.find(r => r.id === fillReviewId);
  const currentFillReviewQuestions = currentFillReview
    ? (typeof currentFillReview.questions === "string" ? JSON.parse(currentFillReview.questions) : currentFillReview.questions || [])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Weekly Reviews</h2>
          <p className="text-muted-foreground text-sm">
            {isRoot ? "Create review templates with paragraph questions for staff to fill weekly." : "Fill your weekly review and performance reports."}
          </p>
        </div>
        {isRoot && (
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Review Template
          </Button>
        )}
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates"><ClipboardList className="h-4 w-4 mr-1.5" /> {isRoot ? "Templates" : "Weekly Reports Due"}</TabsTrigger>
          <TabsTrigger value="responses"><FileText className="h-4 w-4 mr-1.5" /> Responses</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <div className="grid gap-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : reviews.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="text-center py-12 text-muted-foreground">
                  No review templates yet.
                </CardContent>
              </Card>
            ) : reviews
                .filter(r => isRoot || !r.assigned_department || r.assigned_department === myDepartment)
                .map(review => {
                  const daysUntil = getDaysUntilNext(review.fill_day);
                  const isDueSoon = daysUntil <= (review.notify_days_before || 3);
                  const parsedQuestions = typeof review.questions === "string" ? JSON.parse(review.questions) : (review.questions || []);
                  const responseCount = responses.filter(r => r.review_id === review.id).length;
                  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
                  const hasSubmittedThisWeek = responses.some(res => res.review_id === review.id && res.staff_id === myStaffId && res.week_start === weekStartStr);

                  return (
                    <Card key={review.id} className={`${!review.is_active ? "opacity-50" : ""} ${isDueSoon && review.is_active ? "border-amber-300 bg-amber-50/30" : ""}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {review.title}
                              {isDueSoon && review.is_active && !hasSubmittedThisWeek && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 animate-pulse text-[10px]" variant="outline">
                                  <Bell className="h-3 w-3 mr-1" /> Due soon
                                </Badge>
                              )}
                              {hasSubmittedThisWeek && (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]" variant="outline">
                                  <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Done for this week
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              Fill on: <strong>{review.fill_day}</strong>
                              {review.assigned_department && <> · Dept: <strong>{review.assigned_department}</strong></>}
                              {" · "}{parsedQuestions.length} question{parsedQuestions.length !== 1 ? "s" : ""}
                              {isRoot && <> · {responseCount} response{responseCount !== 1 ? "s" : ""}</>}
                            </CardDescription>
                          </div>
                          <div className="flex gap-1.5">
                            {isRoot ? (
                              <>
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setViewReviewId(review.id)}>
                                  <Eye className="h-3 w-3 mr-1" /> View Responses
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleActive(review.id, review.is_active)}>
                                  {review.is_active ? "Disable" : "Enable"}
                                </Button>
                              </>
                            ) : (
                              <Button
                                disabled={hasSubmittedThisWeek || !review.is_active}
                                variant={hasSubmittedThisWeek ? "outline" : "default"}
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => { setFillReviewId(review.id); setFillAnswers({}); }}
                              >
                                {hasSubmittedThisWeek ? "Submitted" : "Fill Weekly Report"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {parsedQuestions.map((q, i) => (
                            <div key={q.id || i} className="flex items-start gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2">
                              <span className="text-muted-foreground font-mono text-xs mt-0.5">{i + 1}.</span>
                              <span>{q.question}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </TabsContent>

        <TabsContent value="responses" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Weekly Report Submissions</CardTitle>
                  <CardDescription>
                    {isRoot ? "Submitted weekly reports and feedback from staff." : "Your submitted weekly reviews."}
                  </CardDescription>
                </div>
                {isRoot && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={responseFilter} onValueChange={setResponseFilter}>
                      <SelectTrigger className="w-full sm:w-[220px]">
                        <SelectValue placeholder="Responses by..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Staff</SelectItem>
                        {staffList.map(s => (
                          <SelectItem key={s.id} value={s.id}>👤 {s.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Week Of</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const filtered = responses
                      .filter(r => isRoot || r.staff_id === myStaffId)
                      .filter(r => isRoot && responseFilter !== "all" ? r.staff_id === responseFilter : true);
                    
                    return filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No reports found.</TableCell></TableRow>
                    ) : filtered.map(r => {
                      const rev = reviews.find(rv => rv.id === r.review_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.staff?.full_name || r.staff_name || "—"}</TableCell>
                          <TableCell className="text-sm">{rev?.title || "—"}</TableCell>
                          <TableCell className="text-sm">{r.week_start ? format(new Date(r.week_start), "dd MMM yyyy") : "—"}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200`}>
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.submitted_at ? format(new Date(r.submitted_at), "dd MMM, HH:mm") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Fill Review Dialog */}
      <Dialog open={!!fillReviewId} onOpenChange={(open) => !open && setFillReviewId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fill {currentFillReview?.title}</DialogTitle>
            <DialogDescription>{currentFillReview?.description || "Answer the questions below to submit your weekly report."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFillSubmit} className="space-y-4 py-2">
            {currentFillReviewQuestions.map((q, idx) => (
              <div key={q.id} className="space-y-2">
                <Label className="text-sm font-semibold">{idx + 1}. {q.question}</Label>
                <Textarea
                  required
                  placeholder="Type your response here..."
                  value={fillAnswers[q.id] || ""}
                  onChange={e => setFillAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  rows={4}
                />
              </div>
            ))}
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setFillReviewId(null)}>Cancel</Button>
              <Button type="submit" disabled={isSubmittingResponse}>
                {isSubmittingResponse ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit Weekly Report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Review Detail Dialog */}
      <Dialog open={!!viewReviewId} onOpenChange={(open) => !open && setViewReviewId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewReview?.title}</DialogTitle>
            <DialogDescription>
              Fill day: {viewReview?.fill_day} · {viewResponses.length} response(s)
            </DialogDescription>
          </DialogHeader>
          {viewReview && (() => {
            const pq = typeof viewReview.questions === "string" ? JSON.parse(viewReview.questions) : (viewReview.questions || []);
            return (
              <div className="space-y-4">
                <h4 className="font-semibold text-sm uppercase text-muted-foreground">Questions</h4>
                {pq.map((q, i) => (
                  <div key={q.id || i} className="border rounded-lg p-3">
                    <p className="text-sm font-medium">{i + 1}. {q.question}</p>
                  </div>
                ))}
                {viewResponses.length > 0 && (
                  <>
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground mt-6">Responses</h4>
                    {viewResponses.map(resp => {
                      const answers = typeof resp.answers === "string" ? JSON.parse(resp.answers) : (resp.answers || {});
                      return (
                        <Card key={resp.id} className="bg-muted/30">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{resp.staff?.full_name || resp.staff_name}</CardTitle>
                            <CardDescription className="text-xs">
                              Week of {resp.week_start ? format(new Date(resp.week_start), "dd MMM yyyy") : "—"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {pq.map((q, i) => (
                              <div key={q.id || i}>
                                <p className="text-xs text-muted-foreground">{q.question}</p>
                                <p className="text-sm mt-0.5">{answers[q.id] || <span className="italic text-muted-foreground">No answer</span>}</p>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Create Review Template Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Weekly Review Template</DialogTitle>
            <DialogDescription>Define paragraph questions that staff will answer weekly.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateReview} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Review Title*</Label>
              <Input required value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} placeholder="e.g. Weekly Performance Review" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={reviewDesc} onChange={e => setReviewDesc(e.target.value)} placeholder="Context for the review..." />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Fill Day*</Label>
                <Select value={fillDay} onValueChange={setFillDay}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map(d => <SelectItem key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notify Before (days)</Label>
                <Input type="number" min="1" max="7" value={notifyDays} onChange={e => setNotifyDays(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={assignedDept} onValueChange={setAssignedDept}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    <SelectItem value="Shop">Shop</SelectItem>
                    <SelectItem value="Kitchen">Kitchen</SelectItem>
                    <SelectItem value="Store">Store</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold">Questions*</Label>
                <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                  <Plus className="h-3 w-3 mr-1" /> Add Question
                </Button>
              </div>
              {questions.map((q, i) => (
                <div key={q.id} className="flex gap-2 items-start">
                  <span className="text-xs text-muted-foreground mt-3 font-mono w-5">{i + 1}.</span>
                  <div className="flex-1 space-y-1">
                    <Input
                      required
                      value={q.question}
                      onChange={e => updateQuestion(q.id, "question", e.target.value)}
                      placeholder="Enter your question..."
                    />
                  </div>
                  {questions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 mt-0" onClick={() => removeQuestion(q.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
