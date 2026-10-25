
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_action_log": {
                  Row: {
                    "action": string,"actor": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"permissions_used": (string)[],"result": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"permissions_used"?: (string)[],"result": string,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"permissions_used"?: (string)[],"result"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_action_log_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_action_log_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_conversations": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_conversations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_conversations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_messages": {
                  Row: {
                    "content": string,"conversation_id": string,"created_at": string,"id": string,"role": string,"suggestions": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"conversation_id": string,"created_at"?: string,"id"?: string,"role": string,"suggestions"?: Json | null
                  }
                  Update: {
                    "content"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"role"?: string,"suggestions"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "agent_conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_profiles": {
                  Row: {
                    "consent": NonNullable<Json>,"consent_updated_at": string | null,"feedback_notes": NonNullable<Json>,"summary": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent"?: NonNullable<Json>,"consent_updated_at"?: string | null,"feedback_notes"?: NonNullable<Json>,"summary"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "consent"?: NonNullable<Json>,"consent_updated_at"?: string | null,"feedback_notes"?: NonNullable<Json>,"summary"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"business_capabilities": {
                  Row: {
                    "accepts_ai_proposals": boolean,"business_id": string,"capacity": number,"equipment_tags": (string)[],"event_categories": (string)[],"formats": (string)[],"hosting_slots": (string)[],"max_price_cents": number | null,"min_price_cents": number | null,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts_ai_proposals"?: boolean,"business_id": string,"capacity": number,"equipment_tags"?: (string)[],"event_categories"?: (string)[],"formats"?: (string)[],"hosting_slots"?: (string)[],"max_price_cents"?: number | null,"min_price_cents"?: number | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accepts_ai_proposals"?: boolean,"business_id"?: string,"capacity"?: number,"equipment_tags"?: (string)[],"event_categories"?: (string)[],"formats"?: (string)[],"hosting_slots"?: (string)[],"max_price_cents"?: number | null,"min_price_cents"?: number | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_capabilities_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "address": string,"category": string,"created_at": string,"description": string | null,"hours": NonNullable<Json>,"id": string,"image_url": string | null,"is_active": boolean,"lat": number,"lng": number,"name": string,"neighborhood": string | null,"owner_id": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"category": string,"created_at"?: string,"description"?: string | null,"hours"?: NonNullable<Json>,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"lat": number,"lng": number,"name": string,"neighborhood"?: string | null,"owner_id": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"category"?: string,"created_at"?: string,"description"?: string | null,"hours"?: NonNullable<Json>,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"lat"?: number,"lng"?: number,"name"?: string,"neighborhood"?: string | null,"owner_id"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"connections": {
                  Row: {
                    "created_at": string,"id": string,"message": string | null,"recipient_id": string,"requester_id": string,"responded_at": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"recipient_id": string,"requester_id": string,"responded_at"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"recipient_id"?: string,"requester_id"?: string,"responded_at"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connections_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connections_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connections_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connections_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"demand_cluster_members": {
                  Row: {
                    "cluster_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cluster_id": string,"user_id": string
                  }
                  Update: {
                    "cluster_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "demand_cluster_members_cluster_id_fkey"
      columns: ["cluster_id"]
isOneToOne: false
      referencedRelation: "demand_clusters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demand_cluster_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "demand_cluster_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"demand_clusters": {
                  Row: {
                    "activity_prefs": NonNullable<Json>,"budget_p50_cents": number | null,"category": string,"center_lat": number,"center_lng": number,"created_at": string,"geocell": string,"group_size_mode": string | null,"id": string,"member_count": number,"run_id": string,"signature": string,"slot": string,"top_interests": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_prefs"?: NonNullable<Json>,"budget_p50_cents"?: number | null,"category": string,"center_lat": number,"center_lng": number,"created_at"?: string,"geocell": string,"group_size_mode"?: string | null,"id"?: string,"member_count": number,"run_id": string,"signature": string,"slot": string,"top_interests": NonNullable<Json>
                  }
                  Update: {
                    "activity_prefs"?: NonNullable<Json>,"budget_p50_cents"?: number | null,"category"?: string,"center_lat"?: number,"center_lng"?: number,"created_at"?: string,"geocell"?: string,"group_size_mode"?: string | null,"id"?: string,"member_count"?: number,"run_id"?: string,"signature"?: string,"slot"?: string,"top_interests"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "demand_clusters_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "opportunity_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"direct_messages": {
                  Row: {
                    "body": string,"connection_id": string,"created_at": string,"id": string,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"connection_id": string,"created_at"?: string,"id"?: string,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"connection_id"?: string,"created_at"?: string,"id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "direct_messages_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"event_proposals": {
                  Row: {
                    "business_edits": Json | null,"business_id": string,"cluster_id": string | null,"created_at": string,"decided_at": string | null,"decision_note": string | null,"expires_at": string,"id": string,"proposal": NonNullable<Json>,"resulting_event_id": string | null,"revision": number,"revision_request": Json | null,"run_id": string | null,"source": string,"source_group_id": string | null,"source_plan_id": string | null,"source_suggestion_index": number | null,"status": string,"supersedes_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_edits"?: Json | null,"business_id": string,"cluster_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decision_note"?: string | null,"expires_at"?: string,"id"?: string,"proposal": NonNullable<Json>,"resulting_event_id"?: string | null,"revision"?: number,"revision_request"?: Json | null,"run_id"?: string | null,"source"?: string,"source_group_id"?: string | null,"source_plan_id"?: string | null,"source_suggestion_index"?: number | null,"status"?: string,"supersedes_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "business_edits"?: Json | null,"business_id"?: string,"cluster_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decision_note"?: string | null,"expires_at"?: string,"id"?: string,"proposal"?: NonNullable<Json>,"resulting_event_id"?: string | null,"revision"?: number,"revision_request"?: Json | null,"run_id"?: string | null,"source"?: string,"source_group_id"?: string | null,"source_plan_id"?: string | null,"source_suggestion_index"?: number | null,"status"?: string,"supersedes_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_proposals_cluster_id_fkey"
      columns: ["cluster_id"]
isOneToOne: false
      referencedRelation: "demand_clusters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_proposals_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "opportunity_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_proposals_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "event_proposals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_business_fk"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"capacity": number,"category": string,"created_at": string,"description": string,"ends_at": string,"format": string | null,"id": string,"price_cents": number | null,"proposal_id": string | null,"published_at": string | null,"source": string,"starts_at": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"capacity": number,"category": string,"created_at"?: string,"description": string,"ends_at": string,"format"?: string | null,"id"?: string,"price_cents"?: number | null,"proposal_id"?: string | null,"published_at"?: string | null,"source": string,"starts_at": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"capacity"?: number,"category"?: string,"created_at"?: string,"description"?: string,"ends_at"?: string,"format"?: string | null,"id"?: string,"price_cents"?: number | null,"proposal_id"?: string | null,"published_at"?: string | null,"source"?: string,"starts_at"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_proposal_fk"
      columns: ["proposal_id"]
isOneToOne: false
      referencedRelation: "event_proposals"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "created_at": string,"group_id": string,"joined_at": string | null,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"joined_at"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"joined_at"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_plan_votes": {
                  Row: {
                    "created_at": string,"plan_id": string,"suggestion_index": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"plan_id": string,"suggestion_index": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"plan_id"?: string,"suggestion_index"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_plan_votes_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "group_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_plan_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_plan_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_plans": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"members_included": number,"request_text": string,"requested_by": string | null,"suggestions": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"members_included": number,"request_text": string,"requested_by"?: string | null,"suggestions": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"members_included"?: number,"request_text"?: string,"requested_by"?: string | null,"suggestions"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_plans_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_plans_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_plans_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"creator_id": string,"description": string | null,"event_id": string | null,"id": string,"interests": (string)[],"kind": string,"name": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"creator_id": string,"description"?: string | null,"event_id"?: string | null,"id"?: string,"interests"?: (string)[],"kind"?: string,"name": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"creator_id"?: string,"description"?: string | null,"event_id"?: string | null,"id"?: string,"interests"?: (string)[],"kind"?: string,"name"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "created_at": string,"event_id": string | null,"group_id": string | null,"id": string,"kind": string,"recipient_id": string,"responded_at": string | null,"sender_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id"?: string | null,"group_id"?: string | null,"id"?: string,"kind": string,"recipient_id": string,"responded_at"?: string | null,"sender_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string | null,"group_id"?: string | null,"id"?: string,"kind"?: string,"recipient_id"?: string,"responded_at"?: string | null,"sender_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"id": string,"payload": NonNullable<Json>,"read_at": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunity_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": string,"started_at": string,"stats": NonNullable<Json>,"status": string,"triggered_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string,"triggered_by": string
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string,"triggered_by"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"coarse_lat": number | null,"coarse_lng": number | null,"created_at": string,"display_name": string,"id": string,"is_adult_confirmed": boolean,"is_discoverable": boolean,"is_operator": boolean,"neighborhood": string | null,"onboarding_completed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"coarse_lat"?: number | null,"coarse_lng"?: number | null,"created_at"?: string,"display_name": string,"id": string,"is_adult_confirmed"?: boolean,"is_discoverable"?: boolean,"is_operator"?: boolean,"neighborhood"?: string | null,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"coarse_lat"?: number | null,"coarse_lng"?: number | null,"created_at"?: string,"display_name"?: string,"id"?: string,"is_adult_confirmed"?: boolean,"is_discoverable"?: boolean,"is_operator"?: boolean,"neighborhood"?: string | null,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"reason": string,"reported_id": string,"reporter_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason": string,"reported_id": string,"reporter_id": string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason"?: string,"reported_id"?: string,"reporter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_reported_id_fkey"
      columns: ["reported_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_id_fkey"
      columns: ["reported_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "activity_prefs": (string)[],"availability_slots": (string)[],"budget_max_cents": number | null,"budget_min_cents": number | null,"dealbreakers": (string)[],"field_sources": NonNullable<Json>,"group_size_pref": string | null,"interest_categories": (string)[],"interests": (string)[],"social_goals": (string)[],"travel_radius_km": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_prefs"?: (string)[],"availability_slots"?: (string)[],"budget_max_cents"?: number | null,"budget_min_cents"?: number | null,"dealbreakers"?: (string)[],"field_sources"?: NonNullable<Json>,"group_size_pref"?: string | null,"interest_categories"?: (string)[],"interests"?: (string)[],"social_goals"?: (string)[],"travel_radius_km"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "activity_prefs"?: (string)[],"availability_slots"?: (string)[],"budget_max_cents"?: number | null,"budget_min_cents"?: number | null,"dealbreakers"?: (string)[],"field_sources"?: NonNullable<Json>,"group_size_pref"?: string | null,"interest_categories"?: (string)[],"interests"?: (string)[],"social_goals"?: (string)[],"travel_radius_km"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profile_public_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "profile_public_cards": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"display_name": string,"id": string,"neighborhood": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_url"?: string | null,"bio"?: string | null,"display_name"?: string | null,"id"?: string | null,"neighborhood"?: string | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"bio"?: string | null,"display_name"?: string | null,"id"?: string | null,"neighborhood"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "block_user":
{ Args: { "p_blocked": string,"p_blocker": string }; Returns: undefined
                           },
"business_candidates":
{ Args: { "p_category": string,"p_cohort_size": number,"p_lat": number,"p_lng": number,"p_radius_km": number }; Returns: {
              "address": string,"business_id": string,"capacity": number,"category": string,"description": string,"distance_km": number,"equipment_tags": (string)[],"event_categories": (string)[],"formats": (string)[],"hosting_slots": (string)[],"hours": Json,"image_url": string,"max_price_cents": number,"min_price_cents": number,"name": string,"neighborhood": string
            }[]
                           },
"can_act_on_business":
{ Args: { "p_business_id": string }; Returns: boolean
                           },
"can_reach":
{ Args: { "p_other": string }; Returns: boolean
                           },
"can_read_group":
{ Args: { "p_group": string }; Returns: boolean
                           },
"cancel_event":
{ Args: { "p_event_id": string,"p_reason": string }; Returns: Json
                           },
"create_group_with_owner":
{ Args: { "p_creator": string,"p_description"?: string,"p_interests"?: (string)[],"p_name": string,"p_visibility": string }; Returns: string
                           },
"decide_proposal":
{ Args: { "p_decision": string,"p_edits"?: Json,"p_event"?: Json,"p_note"?: string,"p_proposal_id": string }; Returns: Json
                           },
"demand_owns_business":
{ Args: { "target": string }; Returns: boolean
                           },
"event_transition_allowed":
{ Args: { "p_from": string,"p_to": string }; Returns: boolean
                           },
"haversine_km":
{ Args: { "lat1": number,"lat2": number,"lng1": number,"lng2": number }; Returns: number
                           },
"invite_to_group":
{ Args: { "p_group": string,"p_recipients": (string)[],"p_sender": string }; Returns: {
              "invitation_id": string,"invitee_id": string
            }[]
                           },
"is_blocked_with":
{ Args: { "p_other": string }; Returns: boolean
                           },
"is_group_admin":
{ Args: { "p_group": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "p_group": string,"p_statuses"?: (string)[] }; Returns: boolean
                           },
"is_trusted_server":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"leave_group":
{ Args: { "p_group": string,"p_user": string }; Returns: string
                           },
"publish_event":
{ Args: { "p_event_id": string }; Returns: Json
                           },
"remove_group_member":
{ Args: { "p_group": string,"p_user": string }; Returns: undefined
                           },
"save_demand_proposal":
{ Args: { "p_business_id": string,"p_cluster": Json,"p_member_ids": (string)[],"p_proposal": Json,"p_run_id": string }; Returns: string
                           },
"save_proposal_revision":
{ Args: { "p_parent_id": string,"p_proposal": Json,"p_request": Json }; Returns: string
                           },
"start_opportunity_run":
{ Args: { "trigger_source": string }; Returns: string
                           },
"tables_without_rls":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"transfer_group_owner":
{ Args: { "p_from": string,"p_group": string,"p_to": string }; Returns: undefined
                           },
"transition_event_status":
{ Args: { "p_event_id": string,"p_to": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
