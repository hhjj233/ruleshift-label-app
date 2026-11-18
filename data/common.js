window.RS_COMMON = {
 "config": {
  "project": "RuleShift",
  "batch": "batch1",
  "schema": "ruleshift-screening-v1",
  "app_version": 1,
  "annotators": [
   "A",
   "B"
  ],
  "guide": "guide/index.html",
  "github": {
   "owner": "hhjj233",
   "repo": "ruleshift-label-data",
   "branch": "main",
   "dir": "labels/batch1",
   "api": "https://api.github.com"
  }
 },
 "sections": [
  [
   "The ego car",
   [
    "ego_decision",
    "ego_lane_clear"
   ]
  ],
  [
   "Permanent rules",
   [
    "permanent_rule_visible",
    "permanent_rule_covered"
   ]
  ],
  [
   "Temporary control",
   [
    "main_temporary_control",
    "applies_to_ego",
    "relation_to_permanent",
    "effective_rule_label"
   ]
  ],
  [
   "Editing",
   [
    "families",
    "edit_options",
    "hidden_dependencies"
   ]
  ],
  [
   "Quality",
   [
    "text_readable",
    "priority_for_full_labeling"
   ]
  ]
 ],
 "fields": [
  {
   "name": "ego_decision",
   "question": "The ego car's next choice at this spot.",
   "tip": "Pick the decision the temporary controls are about. If there is none, choose no_clear_decision and set priority to exclude.",
   "multi": false,
   "options": [
    {
     "value": "turn_at_intersection",
     "meaning": "The ego vehicle must choose a turning movement at an intersection."
    },
    {
     "value": "enter_road_ahead",
     "meaning": "The question is whether the ego vehicle may enter or continue into the road ahead."
    },
    {
     "value": "lane_choice_or_merge",
     "meaning": "The ego vehicle must choose, keep or leave a lane (lane closed, lane ends, merge)."
    },
    {
     "value": "follow_shift_or_detour",
     "meaning": "The ego vehicle follows a lane shift or a detour route."
    },
    {
     "value": "no_clear_decision",
     "meaning": "No decision of the ego vehicle is governed by these controls."
    },
    {
     "value": "cannot_tell",
     "meaning": "The image does not show enough to decide."
    }
   ]
  },
  {
   "name": "ego_lane_clear",
   "question": "Can you tell which lane or approach the ego car is in?",
   "tip": "Matters most when signs are lane-specific.",
   "multi": false,
   "options": [
    {
     "value": "yes",
     "meaning": "You can tell which lane or approach the camera car is in."
    },
    {
     "value": "no",
     "meaning": "You cannot tell which lane or approach the camera car is in."
    }
   ]
  },
  {
   "name": "permanent_rule_visible",
   "question": "The permanent rule that matters for the decision.",
   "tip": "Permanent signs are not boxed. Look at mast arms, poles at corners, overhead signs, signal heads and pavement arrows. Use several if more than one matters.",
   "multi": false,
   "options": [
    {
     "value": "none_visible",
     "meaning": "No permanent rule relevant to the ego decision is visible."
    },
    {
     "value": "lane_use_sign",
     "meaning": "Permanent lane-use sign: ONLY arrows, RIGHT LANE MUST TURN RIGHT."
    },
    {
     "value": "turn_prohibition",
     "meaning": "Permanent NO LEFT / NO RIGHT / NO U TURN, NO TURN ON RED."
    },
    {
     "value": "one_way_or_do_not_enter",
     "meaning": "Permanent ONE WAY or DO NOT ENTER."
    },
    {
     "value": "stop_or_yield",
     "meaning": "Permanent STOP or YIELD sign."
    },
    {
     "value": "traffic_signal",
     "meaning": "A permanent traffic signal, including turn arrows, governs the decision."
    },
    {
     "value": "pavement_arrows_or_lines",
     "meaning": "Turn arrows or solid lines painted on the road."
    },
    {
     "value": "several",
     "meaning": "More than one of the above."
    },
    {
     "value": "cannot_tell",
     "meaning": "Too small, too far or occluded to tell."
    }
   ]
  },
  {
   "name": "permanent_rule_covered",
   "question": "Is that permanent sign or signal covered, bagged, turned away or switched off?",
   "tip": "A black bag or plastic over a sign or a signal head counts as covered.",
   "multi": false,
   "options": [
    {
     "value": "no",
     "meaning": "The relevant permanent sign or signal is visible and not covered."
    },
    {
     "value": "yes",
     "meaning": "The relevant permanent sign or signal head is covered, bagged, turned away or switched off, or the marking is blacked out."
    },
    {
     "value": "partly",
     "meaning": "Some relevant permanent signs or signal heads are covered, others are not."
    },
    {
     "value": "no_permanent_rule",
     "meaning": "There is no relevant permanent sign or signal."
    }
   ]
  },
  {
   "name": "main_temporary_control",
   "question": "The temporary control that matters most for the decision.",
   "tip": "If several devices make it up, click their IDs below.",
   "multi": false,
   "options": [
    {
     "value": "road_closed",
     "meaning": "ROAD CLOSED, RAMP CLOSED, BRIDGE CLOSED."
    },
    {
     "value": "lane_closed_or_lane_ends",
     "meaning": "LANE CLOSED, RIGHT/LEFT LANE CLOSED (AHEAD), LANE ENDS."
    },
    {
     "value": "access_restriction",
     "meaning": "Closed to some users only: LOCAL TRAFFIC ONLY, ROAD CLOSED TO THRU TRAFFIC, NO TRUCKS."
    },
    {
     "value": "detour_or_lane_shift",
     "meaning": "DETOUR arrows, LANE SHIFT, KEEP LEFT/RIGHT."
    },
    {
     "value": "temporary_turn_or_lane_use_sign",
     "meaning": "Temporary ONLY arrows or turn instructions for a lane."
    },
    {
     "value": "temporary_no_turn_or_do_not_enter",
     "meaning": "Temporary NO LEFT/RIGHT TURN, DO NOT ENTER."
    },
    {
     "value": "arrow_board",
     "meaning": "An arrow board showing LEFT or RIGHT is the main control."
    },
    {
     "value": "flagger_or_police",
     "meaning": "A flagger or police officer directs traffic."
    },
    {
     "value": "temporary_signal",
     "meaning": "A portable or temporary traffic signal, e.g. for alternating one-lane traffic."
    },
    {
     "value": "channelizing_closes_path",
     "meaning": "Cones, drums or barricades close a path without a regulatory sign."
    },
    {
     "value": "warning_only",
     "meaning": "Only warning signs (ROAD WORK AHEAD, SLOW, BE PREPARED TO STOP)."
    },
    {
     "value": "none",
     "meaning": "No temporary control relevant to the ego decision."
    }
   ]
  },
  {
   "name": "applies_to_ego",
   "question": "Who is that control addressed to?",
   "tip": "partly is for controls that address some users only, such as thru traffic or trucks.",
   "multi": false,
   "options": [
    {
     "value": "yes",
     "meaning": "The main temporary control governs the ego lane or approach."
    },
    {
     "value": "no_other_lane",
     "meaning": "It governs another lane of the same road."
    },
    {
     "value": "no_other_road_or_approach",
     "meaning": "It governs a side street, a ramp or another approach."
    },
    {
     "value": "no_pedestrians_or_bikes",
     "meaning": "It is addressed to pedestrians or cyclists."
    },
    {
     "value": "partly",
     "meaning": "It governs some users only (e.g. thru traffic, trucks)."
    },
    {
     "value": "unclear",
     "meaning": "You cannot tell who it governs."
    }
   ]
  },
  {
   "name": "relation_to_permanent",
   "question": "How do the temporary controls change the permanent rules for the ego car?",
   "tip": "The key question; see the six ideas in the guide. Permanent sign or signal uncovered but contradicted: conflict_permanent_not_covered. A flagger or temporary signal sending you across a permanent marking: replaces_permanent.",
   "multi": false,
   "options": [
    {
     "value": "replaces_permanent",
     "meaning": "A permanent rule is covered or removed AND an authorized temporary regulatory sign replaces it; or a flagger, a temporary signal or cones send traffic along a path a permanent marking forbids (family A)."
    },
    {
     "value": "adds_new_restriction",
     "meaning": "A temporary regulatory rule is added; no permanent rule is replaced (e.g. ROAD CLOSED, temporary NO LEFT TURN)."
    },
    {
     "value": "physical_only_rule_unchanged",
     "meaning": "Devices physically block a path; the permanent rules stay as they are (family B)."
    },
    {
     "value": "applies_elsewhere",
     "meaning": "The temporary rule is addressed to another lane, road or road user (family C)."
    },
    {
     "value": "warning_or_guidance_only",
     "meaning": "Temporary devices only warn or guide; no rule changes."
    },
    {
     "value": "conflict_permanent_not_covered",
     "meaning": "A temporary rule contradicts a permanent sign or signal that is still visible and uncovered."
    },
    {
     "value": "unclear",
     "meaning": "You cannot tell how the temporary controls relate to the permanent rules."
    }
   ]
  },
  {
   "name": "effective_rule_label",
   "question": "Would informed drivers agree which rules apply now?",
   "tip": "ambiguous needs a note saying why.",
   "multi": false,
   "options": [
    {
     "value": "clear",
     "meaning": "An informed driver would agree on which rules apply to the ego vehicle."
    },
    {
     "value": "ambiguous",
     "meaning": "Reasonable drivers could disagree; note why."
    },
    {
     "value": "not_possible",
     "meaning": "The image does not show enough to decide."
    }
   ]
  },
  {
   "name": "families",
   "question": "Which kinds of counterfactual edit could this scene support?",
   "tip": "Choose every family that fits, or none. See Families in the guide.",
   "multi": true,
   "options": [
    {
     "value": "A",
     "meaning": "Valid supersession: cover a permanent rule and add an authorized temporary one."
    },
    {
     "value": "B",
     "meaning": "Closure without supersession: block an allowed path; the permanent rule stays."
    },
    {
     "value": "C",
     "meaning": "Scope shift: same sign, different lane, road or user."
    },
    {
     "value": "D",
     "meaning": "Redundant constraints: a temporary prohibition and a physical blockage on one path."
    },
    {
     "value": "E",
     "meaning": "Non-intervention: change something that should not matter."
    },
    {
     "value": "none",
     "meaning": "No family fits this scene."
    }
   ]
  },
  {
   "name": "edit_options",
   "question": "The most realistic way to edit the scene for one of those families.",
   "tip": "Changing the words on a sign of the same shape is easiest. Removing big or see-through objects such as chain-link fences is hard.",
   "multi": false,
   "options": [
    {
     "value": "same_shape_text_swap",
     "meaning": "Change the words on an existing sign of the same shape (easiest)."
    },
    {
     "value": "replace_sign",
     "meaning": "Replace a sign with one of a different shape or color."
    },
    {
     "value": "cover_or_uncover_sign",
     "meaning": "Cover a permanent sign, or remove an existing cover."
    },
    {
     "value": "remove_small_object",
     "meaning": "Remove a small solid object (a cone, a sign on a stand)."
    },
    {
     "value": "remove_large_or_see_through",
     "meaning": "Remove a large object or a see-through one such as a chain-link fence (hard)."
    },
    {
     "value": "add_or_move_device",
     "meaning": "Add a device or move one to another lane."
    },
    {
     "value": "none_feasible",
     "meaning": "No meaningful edit is feasible."
    }
   ]
  },
  {
   "name": "hidden_dependencies",
   "question": "What else would have to change for the edit to stay consistent?",
   "tip": "Small print on a sign, a sign mounted on a barricade, more closures further ahead.",
   "multi": false,
   "options": [
    {
     "value": "none",
     "meaning": "Nothing else must change if the main control is edited."
    },
    {
     "value": "small_print_on_device",
     "meaning": "Small print on the device repeats its message (e.g. labels on the sign edge)."
    },
    {
     "value": "sign_mounted_on_barricade",
     "meaning": "The sign is mounted on a barricade; removing one affects the other."
    },
    {
     "value": "more_work_zone_beyond",
     "meaning": "More closures or work further ahead would still block the path."
    },
    {
     "value": "conflicting_markings",
     "meaning": "Old pavement markings conflict with the temporary layout."
    },
    {
     "value": "several",
     "meaning": "More than one of the above."
    },
    {
     "value": "other",
     "meaning": "Something else; describe it in notes."
    }
   ]
  },
  {
   "name": "text_readable",
   "question": "Can you read the text that matters?",
   "tip": "Zoom in before deciding.",
   "multi": false,
   "options": [
    {
     "value": "all",
     "meaning": "All relevant sign text is readable."
    },
    {
     "value": "partly",
     "meaning": "Some relevant text is unreadable."
    },
    {
     "value": "none",
     "meaning": "No relevant text is readable."
    },
    {
     "value": "no_text",
     "meaning": "The relevant controls have no text."
    }
   ]
  },
  {
   "name": "priority_for_full_labeling",
   "question": "Should this scene go to the next round?",
   "tip": "high = the answer needs two or more cues; low = one sign states it all; exclude = unusable.",
   "multi": false,
   "options": [
    {
     "value": "high",
     "meaning": "Needs reasoning: the answer combines two or more cues (a closure and an uncovered permanent rule, a sign and who it addresses, a sign and a physical blockage). Clear enough to label in full."
    },
    {
     "value": "medium",
     "meaning": "Usable, but less clear, or only a little reasoning is needed."
    },
    {
     "value": "low",
     "meaning": "One sign states the whole answer and nothing else matters, or usable only if we run short."
    },
    {
     "value": "exclude",
     "meaning": "Not usable (no decision point, unreadable, broken image)."
    }
   ]
  }
 ],
 "note_triggers": [
  "ambiguous",
  "unclear",
  "cannot_tell",
  "not_possible",
  "other",
  "conflict_permanent_not_covered"
 ],
 "example": {
  "id": "pgh04_1354",
  "image": "guide/img/pgh04_1354.jpg",
  "labels": {
   "ego_decision": "turn_at_intersection",
   "ego_lane_clear": "no",
   "permanent_rule_visible": "lane_use_sign",
   "permanent_rule_covered": "no",
   "main_temporary_control": "road_closed",
   "applies_to_ego": "yes",
   "relation_to_permanent": "conflict_permanent_not_covered",
   "effective_rule_label": "ambiguous",
   "families": "B, D",
   "edit_options": "cover_or_uncover_sign",
   "hidden_dependencies": "several",
   "text_readable": "all",
   "priority_for_full_labeling": "high",
   "notes": "Lane-use signs (left lane straight ONLY, right lane must turn right) are not covered, but the road straight ahead is closed (S-signs ROAD CLOSED + barricades) and DETOUR points left. Conflict; detour signs are mounted on the barricades.",
   "minutes_spent": 4
  }
 }
};
