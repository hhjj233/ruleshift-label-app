/* Soft consistency checks shared by the labeling page and the admin page.
   Each entry is [test(labels), message]; they are shown as hints and never block. */
window.RS_CHECKS = (() => {
  const SIGN_RULES = ['lane_use_sign', 'turn_prohibition', 'one_way_or_do_not_enter', 'stop_or_yield', 'traffic_signal'];
  const CHECKS = [
    // markings cannot be covered, and police or flaggers override signals, so those replacements need no cover
    [L => L.relation_to_permanent === 'replaces_permanent' && ['no', 'no_permanent_rule'].includes(L.permanent_rule_covered) &&
      L.permanent_rule_visible !== 'pavement_arrows_or_lines' && L.main_temporary_control !== 'flagger_or_police',
      'Relation says a permanent rule is replaced, but the permanent sign or signal is not marked as covered.'],
    [L => L.relation_to_permanent === 'conflict_permanent_not_covered' && ['yes', 'no_permanent_rule'].includes(L.permanent_rule_covered),
      'Relation says conflict, but no uncovered permanent sign or signal is marked. A conflict needs one.'],
    [L => L.permanent_rule_visible === 'none_visible' && ['no', 'partly'].includes(L.permanent_rule_covered),
      'No permanent rule is visible, but "covered" says an uncovered permanent sign is there.'],
    [L => SIGN_RULES.includes(L.permanent_rule_visible) && L.permanent_rule_covered === 'no_permanent_rule',
      'A permanent sign or signal is named, but "covered" says there is none.'],
    [L => ['no_other_lane', 'no_other_road_or_approach', 'no_pedestrians_or_bikes'].includes(L.applies_to_ego) &&
      L.relation_to_permanent && !['applies_elsewhere', 'unclear'].includes(L.relation_to_permanent),
      'The main control is addressed to someone else; relation is usually "applies elsewhere".'],
    [L => L.main_temporary_control === 'warning_only' && ['replaces_permanent', 'adds_new_restriction'].includes(L.relation_to_permanent),
      'Warning signs never change a rule, but relation says a rule was replaced or added.'],
    [L => L.relation_to_permanent === 'unclear' && L.effective_rule_label === 'clear',
      'Relation is unclear but the effective rule is marked clear; check one of them.'],
    [L => L.ego_decision === 'no_clear_decision' && L.priority_for_full_labeling && L.priority_for_full_labeling !== 'exclude',
      'With no clear decision, the guide says to set priority to exclude.'],
  ];
  return CHECKS;
})();
