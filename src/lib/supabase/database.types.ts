
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
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"coarse_lat": number | null,"coarse_lng": number | null,"created_at": string,"display_name": string,"id": string,"is_adult_confirmed": boolean,"is_discoverable": boolean,"neighborhood": string | null,"onboarding_completed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"coarse_lat"?: number | null,"coarse_lng"?: number | null,"created_at"?: string,"display_name": string,"id": string,"is_adult_confirmed"?: boolean,"is_discoverable"?: boolean,"neighborhood"?: string | null,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"coarse_lat"?: number | null,"coarse_lng"?: number | null,"created_at"?: string,"display_name"?: string,"id"?: string,"is_adult_confirmed"?: boolean,"is_discoverable"?: boolean,"neighborhood"?: string | null,"onboarding_completed_at"?: string | null,"updated_at"?: string
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
"can_read_group":
{ Args: { "p_group": string }; Returns: boolean
                           },
"create_group_with_owner":
{ Args: { "p_creator": string,"p_description"?: string,"p_interests"?: (string)[],"p_name": string,"p_visibility": string }; Returns: string
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
"leave_group":
{ Args: { "p_group": string,"p_user": string }; Returns: string
                           },
"remove_group_member":
{ Args: { "p_group": string,"p_user": string }; Returns: undefined
                           },
"tables_without_rls":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"transfer_group_owner":
{ Args: { "p_from": string,"p_group": string,"p_to": string }; Returns: undefined
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
